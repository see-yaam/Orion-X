import torch
torch.set_num_threads(1) # CRITICAL MAC CRASH FIX

import cv2
import threading
import time
import numpy as np
from typing import Optional, Dict, Any
import scara_final as sf

class RobotEngine:
    def __init__(self):
        self.cap = None
        self.serial_conn = None
        self.controller = None
        self.model = None # Deferred loading
        self.homography = None
        
        self.running = False
        self.thread = None
        
        self.latest_frame_jpg = None
        self.lock = threading.Lock()

    def start_main_thread(self):
        print("Starting Robot Engine in MAIN thread...")
        try:
            self.homography = sf.load_homography()
            self.model = sf.load_model("yolo11n.pt")
        except Exception as exc:
            print(f"Startup error loading model/homography: {exc}")
            return
            
        self.cap = cv2.VideoCapture(sf.CAMERA_INDEX)
        if not self.cap.isOpened():
            print(f"Could not open camera index {sf.CAMERA_INDEX}. Running in Dummy Camera Mode.")
            self.cap = None
            
        self.serial_conn = sf.open_serial()
        self.controller = sf.NonBlockingScaraController(self.serial_conn)
        
        self.running = True
        # Run directly in main thread, blocking
        self._run_loop()

    def stop(self):
        self.running = False
        if self.thread is not None:
            self.thread.join(timeout=2.0)
            
        if self.cap is not None:
            self.cap.release()
            
        if self.serial_conn is not None:
            self.serial_conn.close()
            
        print("Robot Engine Stopped.")

    def _run_loop(self):
        latest_detections = []
        while self.running:
            if self.cap is not None:
                ok, frame = self.cap.read()
            else:
                ok = False
                
            if not ok:
                # Generate a dummy offline frame
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(frame, "CAMERA OFFLINE OR NO PERMISSION", (50, 240), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            else:
                if self.controller.sorting_mode is not None and self.controller.state == sf.STATE_IDLE:
                    latest_detections = sf.run_yolo_detections(frame, self.model, self.homography, self.controller.sorting_mode)
                else:
                    latest_detections = []
                
            self.controller.update()
            
            display = frame.copy()
            sf.draw_overlay(display, latest_detections, self.controller)
            
            # Encode frame to JPEG
            ret, buffer = cv2.imencode('.jpg', display)
            if ret:
                with self.lock:
                    self.latest_frame_jpg = buffer.tobytes()
                    
            # For the snapshot locking from UI
            self._latest_detections = latest_detections
            
            time.sleep(0.03) # Cap at ~30 FPS

    def get_frame(self) -> bytes:
        with self.lock:
            return self.latest_frame_jpg

    def set_mode(self, mode: str):
        if self.controller is None: return False
        
        if self.controller.sorting_mode is None:
            self.controller.sorting_mode = mode
            return True
        return False

    def lock_snapshot(self):
        if self.controller is None: return False
        
        if self.controller.state != sf.STATE_IDLE:
            return False
            
        if not hasattr(self, '_latest_detections') or not self._latest_detections:
            return False
            
        locked_snapshot = list(self._latest_detections)
        self.controller.start_jobs(locked_snapshot)
        return True

    def reset_mode(self):
        if self.controller is None: return False
        
        if self.controller.state == sf.STATE_IDLE:
            self.controller.sorting_mode = None
            return True
        return False
        
    def get_status(self) -> Dict[str, Any]:
        if self.controller is None:
            return {"status": "Offline"}
            
        return {
            "status": self.controller.state,
            "mode": self.controller.sorting_mode,
            "status_text": self.controller.status_text(),
            "queue_len": len(self.controller.job_queue),
            "detections": len(getattr(self, '_latest_detections', []))
        }

engine = RobotEngine()

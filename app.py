from flask import Flask, Response, jsonify, request
from robot_engine import engine
import os
import threading
from werkzeug.serving import make_server

app = Flask(__name__, static_folder='static', static_url_path='')

@app.route('/')
def index():
    return app.send_static_file('index.html')

def gen_frames():
    import time
    while True:
        frame = engine.get_frame()
        if frame is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            time.sleep(0.033) # Cap streaming to ~30 FPS to prevent browser crash!
        else:
            time.sleep(0.1)

@app.route('/video_feed')
def video_feed():
    return Response(gen_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/status')
def get_status():
    if engine.controller:
        state = engine.controller.state
        mode = engine.controller.sorting_mode
    else:
        state = "OFFLINE"
        mode = "NONE"
    
    return jsonify({
        "status": state,
        "mode": mode,
        "arduino_connected": getattr(engine, 'serial_conn', None) is not None
    })

@app.route('/api/mode', methods=['POST'])
def set_mode():
    data = request.json
    mode = data.get('mode')
    if mode in ['SHAPE', 'COLOUR']:
        success = engine.set_mode(mode)
        return jsonify({"success": success})
    elif mode == 'RESET':
        if engine.controller:
            engine.controller.sorting_mode = None
        return jsonify({"success": True})
    return jsonify({"success": False}), 400

@app.route('/api/snapshot', methods=['POST'])
def trigger_snapshot():
    if engine.controller and engine.controller.state == 'IDLE':
        engine.lock_snapshot()
        return jsonify({"success": True})
    return jsonify({"success": False})

@app.route('/api/reset', methods=['POST'])
def reset_mode():
    if engine.controller:
        engine.controller.sorting_mode = None
    return jsonify({"success": True})

@app.route('/api/calibrate_save', methods=['POST'])
def save_calibration():
    import numpy as np
    import cv2
    import scara_final as sf
    from pathlib import Path

    data = request.json
    points = data.get('points', [])
    
    if len(points) < 4:
        return jsonify({"success": False, "error": "At least 4 points required."})
        
    pixel_points = []
    real_points = []
    
    for p in points:
        pixel_points.append([p['px'], p['py']])
        real_points.append([p['rx'], p['ry']])
        
    pts_pixel = np.asarray(pixel_points, dtype=np.float32)
    pts_real_cm = np.asarray(real_points, dtype=np.float32)
    
    homography, mask = cv2.findHomography(pts_pixel, pts_real_cm, method=0)
    if homography is None:
        return jsonify({"success": False, "error": "Could not compute homography from these points."})
        
    # Save the file
    cal_file = Path(sf.__file__).parent / "calibration_matrix.npy"
    np.save(cal_file, homography)
    
    # Hot-reload into running engine
    if engine:
        engine.homography = homography
        
    return jsonify({"success": True})

class ServerThread(threading.Thread):
    def __init__(self, app):
        threading.Thread.__init__(self)
        self.server = make_server('0.0.0.0', 5000, app, threaded=True)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        print("Starting Flask server on http://0.0.0.0:5000")
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()

if __name__ == '__main__':
    # Start the Flask web server in a background thread
    server = ServerThread(app)
    server.start()
    
    # Start the Robot Engine (which loads YOLO and runs OpenCV) in the MAIN thread
    # This prevents macOS PyTorch/Metal crashes!
    try:
        engine.start_main_thread()
    except KeyboardInterrupt:
        print("Shutting down...")
        engine.stop()
        server.shutdown()

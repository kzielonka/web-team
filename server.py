#!/usr/bin/env python3
"""
Web-team adventure - Real-time Collaborative Multiplayer Server
100% Zero-Dependency Python 3 (Asyncio + Standard Library RFC-6455 WebSocket & HTTP Server)
"""

import asyncio
import base64
import hashlib
import json
import math
import mimetypes
import os
import random
import struct
import time

HOST = "0.0.0.0"
PORT = 8080
GAME_DURATION = 60.0

TABLE_WIDTH = 480
TABLE_HEIGHT = 220
CAR_RADIUS = 18
BALL_RADIUS = 14
GOAL_LEFT = TABLE_WIDTH / 2 - 60
GOAL_RIGHT = TABLE_WIDTH / 2 + 60
GOAL_TOP = 24

MANAGER_QUESTIONS = [
    "Quick sync on Jira?",
    "Is this ticket in the sprint?",
    "Can we circle back on deliverables?",
    "Got 5 minutes for a quick 1:1?",
    "What's the ETA on deployment?",
    "Who approved this dog on the desk?!",
    "Can we align on synergies?",
    "Let's take this offline!",
    "Is this blocking the release?",
    "Did you log your story points?",
    "Can you update the roadmap?"
]

DUMMY_OPTIONS = [
    "ASAP", "In Jira", "Tomorrow", "Sprint 42",
    "Ask QA", "Blocked", "LGTM", "Offline", "Need 1:1", "Roadmap", "P0 Bug"
]


# ==================== RFC-6455 WEBSOCKET PROTOCOL ====================

def make_ws_handshake(key: str) -> bytes:
    magic = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    accept_val = base64.b64encode(hashlib.sha1(key.encode('latin1') + magic).digest()).decode('latin1')
    return (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept_val}\r\n\r\n"
    ).encode('latin1')

def encode_ws_frame(message: str) -> bytes:
    payload = message.encode('utf-8')
    length = len(payload)
    if length <= 125:
        header = struct.pack("!BB", 0x81, length)
    elif length <= 65535:
        header = struct.pack("!BBH", 0x81, 126, length)
    else:
        header = struct.pack("!BBQ", 0x81, 127, length)
    return header + payload

async def read_ws_frame(reader: asyncio.StreamReader):
    try:
        header = await reader.readexactly(2)
    except (asyncio.IncompleteReadError, ConnectionResetError):
        return None

    b1, b2 = header[0], header[1]
    opcode = b1 & 0x0F
    is_masked = bool(b2 & 0x80)
    payload_len = b2 & 0x7F

    if opcode == 0x8:  # Close
        return None

    if payload_len == 126:
        ext = await reader.readexactly(2)
        payload_len = struct.unpack("!H", ext)[0]
    elif payload_len == 127:
        ext = await reader.readexactly(8)
        payload_len = struct.unpack("!Q", ext)[0]

    mask = await reader.readexactly(4) if is_masked else b""
    try:
        payload = await reader.readexactly(payload_len)
    except (asyncio.IncompleteReadError, ConnectionResetError):
        return None

    if is_masked:
        unmasked = bytearray(payload_len)
        for i in range(payload_len):
            unmasked[i] = payload[i] ^ mask[i % 4]
        return unmasked.decode('utf-8', errors='ignore')
    return payload.decode('utf-8', errors='ignore')


# ==================== AUTHORITATIVE GAME ROOM ====================

class GameRoom:
    def __init__(self):
        self.clients = set()  # set of writers
        self.client_inputs = {}  # writer -> dict of active keys

        self.is_playing = False
        self.game_duration = GAME_DURATION
        self.time_left = self.game_duration
        self.score = 0
        self.high_score = 0
        self.donkey_triggered = False

        # Physics elements
        self.car = {
            "x": TABLE_WIDTH / 2,
            "y": TABLE_HEIGHT - 40,
            "angle": -math.pi / 2,
            "speed": 0.0,
            "radius": CAR_RADIUS,
            "boosting": False,
            "driving": False
        }

        self.ball = {
            "x": TABLE_WIDTH / 2,
            "y": TABLE_HEIGHT / 2 + 15,
            "vx": 0.0,
            "vy": 0.0,
            "radius": BALL_RADIUS
        }

        self.is_goal_resetting = False
        self.goal_reset_time = 0.0

        # Paws
        self.paws = {
            "left": {"state": "idle", "retreat_at": 0.0},
            "right": {"state": "idle", "retreat_at": 0.0}
        }
        self.next_sneak_time = 0.0

        # Manager
        self.manager = {
            "question": "Quick sync on Jira?",
            "options": [],
            "status": "idle",  # "question", "approved", "wrong", "expired"
            "expires_at": 0.0,
            "next_question_at": 0.0,
            "answered": False
        }

        # Donkey
        self.donkey = {
            "laughing": False,
            "text": ""
        }

    def register_client(self, writer):
        self.clients.add(writer)
        self.client_inputs[writer] = {
            "forward": False,
            "backward": False,
            "left": False,
            "right": False,
            "boost": False
        }

    def unregister_client(self, writer):
        self.clients.discard(writer)
        self.client_inputs.pop(writer, None)

    async def broadcast(self, data: dict):
        if not self.clients:
            return
        frame = encode_ws_frame(json.dumps(data))
        dead = []
        for w in list(self.clients):
            try:
                w.write(frame)
                await w.drain()
            except Exception:
                dead.append(w)
        for w in dead:
            self.unregister_client(w)

    def start_game(self):
        self.is_playing = True
        self.time_left = self.game_duration
        self.score = 0
        self.donkey_triggered = False

        # Reset Car & Ball
        self.car["x"] = TABLE_WIDTH / 2
        self.car["y"] = TABLE_HEIGHT - 40
        self.car["angle"] = -math.pi / 2
        self.car["speed"] = 0.0
        self.car["boosting"] = False
        self.car["driving"] = False

        self.ball["x"] = TABLE_WIDTH / 2
        self.ball["y"] = TABLE_HEIGHT / 2 + 15
        self.ball["vx"] = 0.0
        self.ball["vy"] = 0.0
        self.is_goal_resetting = False

        # Reset Paws
        self.paws["left"]["state"] = "idle"
        self.paws["right"]["state"] = "idle"
        self.next_sneak_time = time.time() + 0.5

        # Reset Manager
        self.manager["status"] = "idle"
        self.manager["options"] = []
        self.manager["answered"] = False
        self.manager["next_question_at"] = time.time() + 0.8

        # Reset Donkey
        self.donkey["laughing"] = False
        self.donkey["text"] = ""

    def trigger_next_manager_question(self):
        if not self.is_playing:
            return
        q = random.choice(MANAGER_QUESTIONS)
        dummies = random.sample(DUMMY_OPTIONS, 3)
        opts = dummies + ["5 do 1"]
        random.shuffle(opts)

        self.manager["question"] = q
        self.manager["options"] = opts
        self.manager["status"] = "question"
        self.manager["answered"] = False
        now = time.time()
        self.manager["expires_at"] = now + 2.0  # 2-second limit!

    def handle_manager_answer(self, option: str):
        if not self.is_playing or self.manager["status"] != "question" or self.manager["answered"]:
            return
        self.manager["answered"] = True
        now = time.time()

        if option == "5 do 1":
            self.score += 1
            if self.score > self.high_score:
                self.high_score = self.score
            self.manager["status"] = "approved"
            self.manager["question"] = "APPROVED! 5 do 1!"
            self.manager["next_question_at"] = now + 1.3
            asyncio.create_task(self.broadcast({"type": "event", "name": "manager_correct"}))
        else:
            self.manager["status"] = "wrong"
            self.manager["question"] = "WRONG! (Always 5 do 1!)"
            self.manager["next_question_at"] = now + 1.4
            asyncio.create_task(self.broadcast({"type": "event", "name": "manager_wrong"}))

    def trigger_paw_sneak(self):
        if not self.is_playing:
            return
        available = [s for s in ["left", "right"] if self.paws[s]["state"] == "idle"]
        if not available:
            return

        side = random.choice(available)
        self.paws[side]["state"] = "sneaking"
        time_factor = (self.game_duration - self.time_left) / self.game_duration
        window = max(0.65, 1.25 - (time_factor * 0.5))
        self.paws[side]["retreat_at"] = time.time() + window

        asyncio.create_task(self.broadcast({"type": "event", "name": "paw_sneak", "side": side}))

    def handle_paw_tap(self, side: str, by_car: bool = False):
        if not self.is_playing:
            return
        paw = self.paws.get(side)
        if paw and paw["state"] == "sneaking":
            paw["state"] = "tapped"
            self.score += 1
            if self.score > self.high_score:
                self.high_score = self.score

            paw_x = 40 if side == "left" else TABLE_WIDTH - 40
            paw_y = TABLE_HEIGHT / 2

            asyncio.create_task(self.broadcast({
                "type": "event",
                "name": "paw_hit",
                "side": side,
                "x": paw_x,
                "y": paw_y,
                "by_car": by_car
            }))

            # Auto reset paw to idle after visual tap
            def reset_paw_later():
                paw["state"] = "idle"
            asyncio.get_event_loop().call_later(0.38, reset_paw_later)

    def trigger_goal(self):
        if self.is_goal_resetting:
            return
        self.is_goal_resetting = True
        self.score += 3
        if self.score > self.high_score:
            self.high_score = self.score

        self.goal_reset_time = time.time() + 1.1

        asyncio.create_task(self.broadcast({
            "type": "event",
            "name": "goal",
            "x": TABLE_WIDTH / 2,
            "y": 24
        }))

    def trigger_donkey(self):
        self.donkey_triggered = True
        self.donkey["laughing"] = True

        if self.score == 0:
            msg = "HEE-HAW! ZERO POINTS?! HA-HA-HA!"
        elif self.score <= 10:
            msg = f"HEE-HAW! ONLY {self.score}?! SO WEAK!"
        elif self.score <= 25:
            msg = f"HEE-HAW! JUST {self.score}?! TOO SLOW!"
        elif self.score <= 45:
            msg = f"HEE-HAW! {self.score} POINTS?! IS THAT ALL?!"
        else:
            msg = f"HEE-HAW! {self.score}?! I CAN BEAT THAT!"

        self.donkey["text"] = msg
        asyncio.create_task(self.broadcast({
            "type": "event",
            "name": "donkey_laugh",
            "text": msg
        }))

    def tick(self, dt: float):
        now = time.time()

        if self.is_playing:
            self.time_left = max(0.0, self.time_left - dt)

            # 1. Aggregate inputs from all connected players
            cf = any(inp.get("forward", False) for inp in self.client_inputs.values())
            cb = any(inp.get("backward", False) for inp in self.client_inputs.values())
            cl = any(inp.get("left", False) for inp in self.client_inputs.values())
            cr = any(inp.get("right", False) for inp in self.client_inputs.values())
            cboost = any(inp.get("boost", False) for inp in self.client_inputs.values())

            # 2. Car Steering & Motion
            turn_speed = 4.2
            if cl:
                self.car["angle"] -= turn_speed * dt
            if cr:
                self.car["angle"] += turn_speed * dt

            if cf:
                acc = 720.0 if cboost else 440.0
                max_spd = 350.0 if cboost else 225.0
                self.car["speed"] = min(max_spd, self.car["speed"] + acc * dt)
            elif cb:
                self.car["speed"] = max(-125.0, self.car["speed"] - 360.0 * dt)
            else:
                self.car["speed"] *= (0.12 ** dt)
                if abs(self.car["speed"]) < 2.0:
                    self.car["speed"] = 0.0

            self.car["x"] += math.cos(self.car["angle"]) * self.car["speed"] * dt
            self.car["y"] += math.sin(self.car["angle"]) * self.car["speed"] * dt

            # Clamp Car inside Table boundaries
            self.car["x"] = max(22.0, min(TABLE_WIDTH - 22.0, self.car["x"]))
            self.car["y"] = max(18.0, min(TABLE_HEIGHT - 18.0, self.car["y"]))

            self.car["driving"] = abs(self.car["speed"]) > 15.0
            self.car["boosting"] = cboost and (cf or self.car["speed"] > 50.0)

            # 3. Ball Physics & Motion
            self.ball["x"] += self.ball["vx"] * dt
            self.ball["y"] += self.ball["vy"] * dt

            ball_damp = 0.35 ** dt
            self.ball["vx"] *= ball_damp
            self.ball["vy"] *= ball_damp
            if math.hypot(self.ball["vx"], self.ball["vy"]) < 2.0:
                self.ball["vx"] = 0.0
                self.ball["vy"] = 0.0

            # Goal scoring check: Top center opening
            if not self.is_goal_resetting and (self.ball["y"] - self.ball["radius"] <= GOAL_TOP) and (GOAL_LEFT <= self.ball["x"] <= GOAL_RIGHT):
                self.trigger_goal()

            # Goal reset timer
            if self.is_goal_resetting and now >= self.goal_reset_time:
                self.ball["x"] = TABLE_WIDTH / 2
                self.ball["y"] = TABLE_HEIGHT / 2 + 15
                self.ball["vx"] = 0.0
                self.ball["vy"] = 0.0
                self.is_goal_resetting = False

            # Ball Wall Bounces
            if self.ball["x"] - self.ball["radius"] < 6.0:
                self.ball["x"] = 6.0 + self.ball["radius"]
                self.ball["vx"] = abs(self.ball["vx"]) * 0.85
                asyncio.create_task(self.broadcast({"type": "event", "name": "ball_hit"}))
            elif self.ball["x"] + self.ball["radius"] > TABLE_WIDTH - 6.0:
                self.ball["x"] = TABLE_WIDTH - 6.0 - self.ball["radius"]
                self.ball["vx"] = -abs(self.ball["vx"]) * 0.85
                asyncio.create_task(self.broadcast({"type": "event", "name": "ball_hit"}))

            if self.ball["y"] + self.ball["radius"] > TABLE_HEIGHT - 8.0:
                self.ball["y"] = TABLE_HEIGHT - 8.0 - self.ball["radius"]
                self.ball["vy"] = -abs(self.ball["vy"]) * 0.85
                asyncio.create_task(self.broadcast({"type": "event", "name": "ball_hit"}))

            if self.ball["y"] - self.ball["radius"] < 8.0:
                if not (GOAL_LEFT <= self.ball["x"] <= GOAL_RIGHT):
                    self.ball["y"] = 8.0 + self.ball["radius"]
                    self.ball["vy"] = abs(self.ball["vy"]) * 0.85
                    asyncio.create_task(self.broadcast({"type": "event", "name": "ball_hit"}))

            # Car - Ball Collision
            cdx = self.ball["x"] - self.car["x"]
            cdy = self.ball["y"] - self.car["y"]
            cdist = math.hypot(cdx, cdy)
            min_dist = self.car["radius"] + self.ball["radius"]
            if cdist < min_dist and cdist > 0.001:
                nx = cdx / cdist
                ny = cdy / cdist
                overlap = min_dist - cdist
                self.ball["x"] += nx * overlap
                self.ball["y"] += ny * overlap

                car_vx = math.cos(self.car["angle"]) * self.car["speed"]
                car_vy = math.sin(self.car["angle"]) * self.car["speed"]
                kick_power = max(160.0, math.hypot(car_vx, car_vy) * 1.45 + (140.0 if cboost else 0.0))

                self.ball["vx"] = nx * kick_power + car_vx * 0.4
                self.ball["vy"] = ny * kick_power + car_vy * 0.4
                self.car["speed"] *= 0.55

                asyncio.create_task(self.broadcast({
                    "type": "event",
                    "name": "car_ball_hit",
                    "x": self.ball["x"],
                    "y": self.ball["y"]
                }))

            # Car & Ball ramming sneaking rear paws
            for side in ["left", "right"]:
                paw = self.paws[side]
                if paw["state"] == "sneaking":
                    paw_x = 40 if side == "left" else TABLE_WIDTH - 40
                    paw_y = TABLE_HEIGHT / 2
                    car_d = math.hypot(self.car["x"] - paw_x, self.car["y"] - paw_y)
                    ball_d = math.hypot(self.ball["x"] - paw_x, self.ball["y"] - paw_y)

                    if car_d < 48.0 or ball_d < 38.0:
                        self.handle_paw_tap(side, by_car=True)
                        if ball_d < 38.0:
                            self.ball["vx"] *= -0.8
                            self.ball["vy"] *= -0.8

                    # Auto retreat on timeout
                    elif now >= paw["retreat_at"]:
                        paw["state"] = "idle"
                        asyncio.create_task(self.broadcast({"type": "event", "name": "paw_retreat", "side": side}))

            # Paw sneak scheduling
            if now >= self.next_sneak_time:
                self.trigger_paw_sneak()
                time_factor = (self.game_duration - self.time_left) / self.game_duration
                min_wait = 0.32
                max_wait = 0.85 - (time_factor * 0.35)
                self.next_sneak_time = now + random.uniform(min_wait, max_wait)

            # Manager quiz lifecycle
            if self.manager["status"] == "question" and not self.manager["answered"]:
                if now >= self.manager["expires_at"]:
                    self.manager["status"] = "expired"
                    self.manager["question"] = "Too slow! Options expired."
                    self.manager["options"] = []
                    self.manager["next_question_at"] = now + 1.4
                    asyncio.create_task(self.broadcast({"type": "event", "name": "manager_expired"}))
            elif self.manager["status"] in ["approved", "wrong", "expired", "idle"]:
                if now >= self.manager["next_question_at"]:
                    self.trigger_next_manager_question()

            # Laughing Donkey in final 1.0 second
            if self.time_left <= 1.0 and not self.donkey_triggered:
                self.trigger_donkey()

            # End of round (60 seconds reached)
            if self.time_left <= 0:
                self.is_playing = False
                if not self.donkey_triggered:
                    self.trigger_donkey()
                asyncio.create_task(self.broadcast({
                    "type": "event",
                    "name": "game_over",
                    "score": self.score,
                    "high_score": self.high_score
                }))

        # Broadcast state snapshot
        snapshot = {
            "type": "state",
            "is_playing": self.is_playing,
            "time_left": round(self.time_left, 1),
            "game_duration": self.game_duration,
            "score": self.score,
            "high_score": self.high_score,
            "players_count": len(self.clients),
            "car": {
                "x": round(self.car["x"], 1),
                "y": round(self.car["y"], 1),
                "angle": round(self.car["angle"], 3),
                "speed": round(self.car["speed"], 1),
                "driving": self.car["driving"],
                "boosting": self.car["boosting"]
            },
            "ball": {
                "x": round(self.ball["x"], 1),
                "y": round(self.ball["y"], 1),
                "vx": round(self.ball["vx"], 1),
                "vy": round(self.ball["vy"], 1)
            },
            "paws": {
                "left": self.paws["left"]["state"],
                "right": self.paws["right"]["state"]
            },
            "manager": {
                "question": self.manager["question"],
                "options": self.manager["options"],
                "status": self.manager["status"],
                "answered": self.manager["answered"],
                "time_remaining": max(0.0, round(self.manager["expires_at"] - now, 2)) if self.manager["status"] == "question" else 0.0
            },
            "donkey": {
                "laughing": self.donkey["laughing"],
                "text": self.donkey["text"]
            }
        }
        asyncio.create_task(self.broadcast(snapshot))


ROOM = GameRoom()


# ==================== HTTP & WEBSOCKET CLIENT HANDLER ====================

async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        # Read HTTP Request
        request_line = await reader.readline()
        if not request_line:
            writer.close()
            await writer.wait_closed()
            return

        line = request_line.decode('latin1').strip()
        parts = line.split()
        if len(parts) < 2:
            writer.close()
            await writer.wait_closed()
            return

        method, raw_path = parts[0], parts[1]
        path = raw_path.split('?')[0]

        # Read headers
        headers = {}
        while True:
            hline = await reader.readline()
            if not hline or hline == b'\r\n' or hline == b'\n':
                break
            hstr = hline.decode('latin1').strip()
            if ':' in hstr:
                k, v = hstr.split(':', 1)
                headers[k.strip().lower()] = v.strip()

        # Handle WebSocket Upgrade
        if headers.get('upgrade', '').lower() == 'websocket' and 'sec-websocket-key' in headers:
            ws_key = headers['sec-websocket-key']
            writer.write(make_ws_handshake(ws_key))
            await writer.drain()

            ROOM.register_client(writer)
            print(f"👥 Player joined! Total online: {len(ROOM.clients)}")

            # Notify all of player count
            await ROOM.broadcast({"type": "players_update", "count": len(ROOM.clients)})

            # Read WS frames
            try:
                while True:
                    msg_text = await read_ws_frame(reader)
                    if msg_text is None:
                        break
                    try:
                        msg = json.loads(msg_text)
                        mtype = msg.get("type")

                        if mtype == "car_input":
                            keys = msg.get("data", {})
                            ROOM.client_inputs[writer] = {
                                "forward": bool(keys.get("forward", False)),
                                "backward": bool(keys.get("backward", False)),
                                "left": bool(keys.get("left", False)),
                                "right": bool(keys.get("right", False)),
                                "boost": bool(keys.get("boost", False))
                            }
                        elif mtype == "paw_tap":
                            side = msg.get("side")
                            ROOM.handle_paw_tap(side)
                        elif mtype == "manager_answer":
                            opt = msg.get("option", "")
                            ROOM.handle_manager_answer(opt)
                        elif mtype == "start_game":
                            ROOM.start_game()
                    except json.JSONDecodeError:
                        pass
            finally:
                ROOM.unregister_client(writer)
                print(f"👋 Player left. Total online: {len(ROOM.clients)}")
                await ROOM.broadcast({"type": "players_update", "count": len(ROOM.clients)})
                writer.close()
                await writer.wait_closed()
            return

        # Serve Static HTTP Files with zero cache
        if path == '/' or path == '':
            path = '/index.html'

        safe_path = os.path.normpath(path.lstrip('/'))
        if safe_path.startswith('..') or os.path.isabs(safe_path):
            safe_path = 'index.html'

        base_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(base_dir, safe_path)

        if os.path.exists(file_path) and os.path.isfile(file_path):
            ctype, _ = mimetypes.guess_type(file_path)
            if not ctype:
                ctype = 'application/octet-stream'
            if file_path.endswith('.css'):
                ctype = 'text/css'
            elif file_path.endswith('.js'):
                ctype = 'application/javascript'
            elif file_path.endswith('.html'):
                ctype = 'text/html'

            with open(file_path, 'rb') as f:
                content = f.read()

            response_headers = (
                "HTTP/1.1 200 OK\r\n"
                f"Content-Type: {ctype}\r\n"
                f"Content-Length: {len(content)}\r\n"
                "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
                "Pragma: no-cache\r\n"
                "Expires: 0\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n"
            ).encode('latin1')

            writer.write(response_headers + content)
            await writer.drain()
        else:
            not_found = b"HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nNot Found"
            writer.write(not_found)
            await writer.drain()

        writer.close()
        await writer.wait_closed()

    except Exception:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


# ==================== MAIN SERVER & TICK LOOP ====================

async def physics_loop():
    tick_rate = 30.0  # 30 updates per second
    dt = 1.0 / tick_rate
    while True:
        start_t = time.time()
        ROOM.tick(dt)
        elapsed = time.time() - start_t
        sleep_dur = max(0.001, dt - elapsed)
        await asyncio.sleep(sleep_dur)

async def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = await asyncio.start_server(handle_client, HOST, PORT)

    # Detect local network IP
    import socket
    local_ip = "localhost"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    print("=" * 60)
    print("🚀 Web-team adventure - ONLINE MULTIPLAYER SERVER ACTIVE!")
    print(f"🎮 Local URL:   http://localhost:{PORT}")
    print(f"📱 Network URL: http://{local_ip}:{PORT} (Open on your phone or share!)")
    print(f"⏱  Time Limit:  {int(GAME_DURATION)} seconds per round")
    print("🤝 Co-op Mode:  One dog, one car, real-time sync across devices!")
    print("=" * 60)

    asyncio.create_task(physics_loop())
    async with server:
        await server.serve_forever()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")

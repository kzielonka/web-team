# Web-team adventure

A fast, fun, 1-minute (60 seconds) reflex browser game created with HTML5, CSS3, and vanilla JavaScript (zero external dependencies).

## Concept & Gameplay
- **The Scene**: A dog sits on a chair behind a clean white desk, while an animated manager watches with coffee.
- **The Dog's Paws**: The dog keeps its front paws on the table, but mischievously sneaks its rear paws onto the surface. Tap or ram them to knock them back!
- **Duration**: Exactly **1 minute (60 seconds)** per round.

## Rocket League Arena on the Desk!
- **WASD / Arrow Keys**: Drive your rocket car across the desk with agile steering and drift dynamics.
- **Space / Shift**: Fire the rocket booster for extra acceleration and top speed!
- **Soccer Ball Physics**: Drive your car into the ball to launch it across the desk with real impulse collisions and wall bounces.
- **GOAL (+3 Points)**: Blast the ball into the glowing arena goal at the top of the desk to score **+3 points**, triggering an air horn fanfare and comic explosion banner!
- **Paw Ramming**: You can also knock back the sneaky rear paws by ramming them directly with your car or deflecting the ball into them!

## The Manager (Always Visible & Urgent!)
- The **manager** is stationed permanently on the left side of the screen holding his steaming coffee cup, suit, and company badge.
- His **speech popup is ALWAYS visible**, continuously asking corporate questions throughout the round!
- **4 Options**:
  - Whenever a question appears, 4 options are presented.
  - **The Golden Rule**: No matter what question the manager asks, **"5 do 1"** is ALWAYS the only correct answer!
  - **2-Second Speed Challenge**: You only have **2 seconds** to tap an answer. If you don't answer within 2 seconds, the options vanish (*"Too slow!"*).
  - **Bonus Points**: Tapping **"5 do 1"** immediately awards **+1 bonus score** and gets manager approval! Tapping any other option triggers a buzzer (*"WRONG! (Always 5 do 1!)"*).
  - After a short cooldown, the manager immediately fires the next question!

## The Laughing Donkey Finale
- In the **last second** of the game (or at game over), the Donkey dramatically bursts up from behind the chair, belly-laughing mockingly at the user's score with floppy ears, wide open mouth, laughing tears, and mocking speech bubbles!

## Highlights
- **100% Zero-Dependency**: Pure CSS & Web Audio API synthesis for pops, springs, office chimes, stadium horns, and braying laughs.
- **Strictly No Emojis**: Clean comic typography and graphic vector styling.
- **Strict No-Cache Server**: `server.py` prevents browser caching issues.

## How to Play
Open `http://localhost:8080` in your browser, or run:
```bash
python3 server.py
```
Then visit: `http://localhost:8080`

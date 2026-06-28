# 3D 2048 Battle Prototype

This is a browser prototype for a 3D version of 2048. The board is a 4 x 4 x 4 cube, and tiles can move in six directions: up, down, left, right, back, and front.

## Run Locally

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Controls

P1 / player:

- `W` / `ArrowUp`: up
- `S` / `ArrowDown`: down
- `A` / `ArrowLeft`: left
- `D` / `ArrowRight`: right
- `Q`: back
- `E`: front
- Touch buttons also control P1.

P2 local friend mode:

- `I`: up
- `K`: down
- `J`: left
- `L`: right
- `U`: back
- `O`: front

## Modes

- `Solo`: one visible board for practice.
- `CPU`: the player and CPU play at the same time. The CPU board is visible beside the player board.
- `Friend`: local simultaneous two-player mode. P1 and P2 can both move independently with separate keys.
- `Online`: two devices connect to the same passphrase room through a WebSocket room server.

## Battle Rules

- Both players play in real time, not by turns.
- Merges create attack power.
- Attack power sends black garbage blocks to the opponent board.
- Garbage blocks cannot merge.
- Garbage blocks show remaining seconds and fade out as they approach expiration.
- `Knockout`: a player loses when no legal move remains.
- `Score Limit`: when the timer reaches zero, the higher score wins.

## Publish Options

This is currently a static site, so the cheapest publishing options are:

- GitHub Pages: simplest for a prototype.
- Cloudflare Pages: good if the project later adds WebSocket matchmaking or Workers.
- Netlify: easy previews and simple static hosting.

For online friend battles, Cloudflare Pages plus a small WebSocket backend is a good next step.

## Online Friend Battle

Start the room server:

```powershell
node server.js
```

Then open the game on two devices that can reach that server.

1. On the first device, choose `Online`, enter a passphrase, and press `Host`.
2. On the second device, choose `Online`, enter the same passphrase, and press `Join`.
3. Both players use the normal P1 controls on their own device.

For local testing on one PC, use `ws://localhost:8787`. For phones or another PC on the same Wi-Fi, replace `localhost` with the host PC's LAN IP, for example `ws://192.168.1.20:8787`.

## Implementation Notes

- `index.html`: UI layout.
- `styles.css`: responsive battle layout.
- `game.js`: board logic, battle rules, CPU movement, garbage blocks, and Three.js rendering.

The current friend mode is local simultaneous play. Online friend battles can reuse the same two-board state model and replace P2 keyboard input with network messages.

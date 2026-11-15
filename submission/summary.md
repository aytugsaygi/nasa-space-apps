# Health Atlas: project summary

**Challenge:** Create Health Monitoring Software for Astronauts on Space Missions · NASA Space Apps Challenge 2026, Ankara

## In one sentence

Health Atlas is an offline health console that lets astronauts understand and manage their own health when help from Earth is minutes away, and lets the flight surgeon follow the crew across a delayed link.

## The problem

On Mars a message to Earth takes about 3 to 22.5 minutes one way, so the crew cannot wait for the ground to interpret every reading. Long missions bring known risks: bone loss, eye changes (SANS), poor sleep, radiation and isolation. Astronauts need a tool that explains their data, not just shows it.

## What it does

- **Home:** health indicator cards with daily mini charts, drawn from 13 indicators (heart rate, blood pressure, blood oxygen, temperature, respiration, blood sugar, sleep, mood, reaction time, exercise, water, radiation and cabin CO₂). A 3D anatomy hologram where the astronaut marks pain directly on the body.
- **Alerts that explain themselves:** every alert states the measured value, the threshold and its source. Thresholds taken from NASA documents carry a "NASA" label.
- **Sport:** a hologram trainer demonstrates the day's exercises. The program follows NASA's exercise guidance for the station, Orion, the Moon and Mars, and changes automatically when the astronaut reports pain.
- **Mental health:** a Cupola window with NASA Earth imagery, breathing exercises, scheduled check-ins and a private journal.
- **Health records:** charts, blood tests flagged against ranges from the Inspiration4 crew (NASA OSDR), space weather from NASA DONKI and a printable report for the flight surgeon.
- **Flight surgeon view:** the crew overview and messages travel with a simulated communication delay and blackouts.
- **Data import:** real sensor data can be loaded from CSV or JSON files with column mapping, unit conversion and a preview.
- **Assistant:** an offline, rule-based health assistant (coach and listener) with a crisis rule that sends the person to the flight surgeon. It does not diagnose.

## NASA data

64 verified sources, 45 of them from NASA. In 7 of the 13 indicators at least one threshold comes from a NASA document. Four NASA datasets: DONKI and EPIC live (with an embedded snapshot when offline) and two OSDR studies. Details: `nasa-data.md`.

## How it is built

TypeScript, React, three.js and a single Node.js server with SQLite. It runs in a browser, needs no new hardware or cloud services and works offline. Turkish and English. Unit, component, end-to-end and accessibility (axe) tests.

## Limitations

Crew data is simulated unless imported. There is no authentication yet. Some thresholds are the team's own rules where no published astronaut threshold exists. It is a decision-support prototype, not a medical device. Details: `roadmap.md` and `feasibility.md`.

## Use of Super Intelligence (SI)

Code was written with Claude Code (Anthropic). The background images and the Cupola and wellbeing videos were generated with Gemini and are watermarked. The intro video was generated with Higgsfield. The assistant and read-aloud feature use no SI. Full list: `../SI-DISCLOSURE.md`.

## References

All sources, data, software, models, images and fonts: `references.md`.

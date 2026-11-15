# Feasibility and cost

Health Atlas needs no new hardware or paid software. It runs in a browser on existing tablets and laptops, on a single Node.js server with SQLite, and works offline. Every component is openly licensed (MIT, Apache 2.0, ISC; anatomy model CC BY-SA 4.0; trainer model CC0). NASA DONKI, EPIC and OSDR data are public and fetched without an API key. The real costs are development effort and, for real use, medical software approval, a cybersecurity audit and flight certification, whose cost depends on the agency's process. An optional language model would be the only usage-based cost; without it the offline assistant keeps working. We give no price figures because none were verified on an official page.

| Item | Today | In real use |
|---|---|---|
| Development | Open-source tools; team effort | Small team for maintenance and validation |
| Hardware | None new; browser | Data from existing wearables (e.g. CSA Bio-Monitor) |
| Licences | Open licences; no fees | Same |
| Data | Public NASA data, no API key | Same |
| Operations | One Node.js + SQLite process, offline | One ground server or on-board computer |
| Language model | Not connected | Optional, usage-based |
| Real use | Prototype | Medical software approval, security audit, flight certification |

_This assesses a hackathon prototype; real costs depend on the agency's requirements and approval process._

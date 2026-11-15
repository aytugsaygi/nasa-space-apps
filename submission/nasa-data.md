# NASA data in Health Atlas

_Generated from the code by `arayuz/scripts/nasa-data-table.mjs`; do not edit by hand._

Health Atlas uses 64 verified sources, 45 of them from NASA. In 7 of its 13 health indicators at least one status threshold comes from a NASA document (13 of 58 threshold bands). It reads 4 NASA datasets: DONKI and EPIC live (with an embedded snapshot when offline) and two OSDR studies.

## Decisions driven by NASA data

| Decision | Where in the app | NASA data | Source |
|---|---|---|---|
| "Low" and "High" flags in blood tests | Health records → Blood tests | Real data: laboratory reference ranges and values from the Inspiration4 crew | [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569), [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) |
| Critical radiation alert ("move to the shielded area") | Alert box and Environment and radiation card | Real data: a solar particle event (SEP) recorded by DONKI triggers the alert; single-event limit 250 mSv | [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/), [NASA-STD-3001 Technical Brief OCHMO-TB-020](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf) |
| Total radiation dose as a share of the career limit | Home radiation card and alert (above 80%) | Limit from a NASA document: 600 mSv over a career | [NASA-STD-3001 Technical Brief OCHMO-TB-020](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf) |
| Delay of messages to the flight surgeon and communication blackout | Report and flight surgeon; when the mission environment is Mars | Value from NASA documents: ~3–22.5 minutes one way to Mars; days of blackout at conjunction | [Houston We Have a Podcast, Episode 59](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/hazard-3-distance/), [Communication Delays, Disruptions, and Blackouts for Crewed Mars Missions](https://ntrs.nasa.gov/api/citations/20220013418/downloads/ASCEND-Communication%20Delays%2C%20Disruptions%2C%20and%20Blackouts%20for%20Crewed%20Mars%20Missions.pdf) |
| Daily exercise program and daily target | Training → Today's program and Training coach | Program from NASA documents: ~2 hours a day with ARED, T2 and CEVIS on the station; flywheel on Orion | [Astronaut Exercise](https://www.nasa.gov/missions/station/iss-research/astronaut-exercise), [Life Encapsulated](https://www.nasa.gov/humans-in-space/life-encapsulated-inside-nasas-orion-for-artemis-ii-moon-mission/), [I Am Artemis](https://www.nasa.gov/missions/artemis/i-am-artemis/i-am-artemis-ryan-schulte/) |
| The five spaceflight hazards each indicator is linked to | Indicator details and the Hazards dialog | The five hazards of NASA's Human Research Program | [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards) |

## Indicator thresholds

| Indicator | Basis of the status bands |
|---|---|
| Heart rate | Medical source: 2 bands ([Vital signs](https://medlineplus.gov/ency/article/002341.htm)); Health Atlas rule (no threshold in the source): 3 bands |
| Blood pressure | Medical source: 11 bands ([Vital signs](https://medlineplus.gov/ency/article/002341.htm), [High Blood Pressure](https://medlineplus.gov/highbloodpressure.html)); Health Atlas rule (no threshold in the source): 2 bands |
| Oxygen | Medical source: 4 bands ([Pulse Oximetry](https://medlineplus.gov/lab-tests/pulse-oximetry/)) |
| Body temperature | Medical source: 2 bands ([Vital signs](https://medlineplus.gov/ency/article/002341.htm)); Health Atlas rule (no threshold in the source): 4 bands |
| Breathing rate | Medical source: 3 bands ([Vital signs](https://medlineplus.gov/ency/article/002341.htm)); Health Atlas rule (no threshold in the source): 2 bands |
| Blood sugar | Medical source: 5 bands ([Low blood sugar](https://medlineplus.gov/ency/article/000386.htm), [Diabetes Testing](https://www.cdc.gov/diabetes/diabetes-testing/index.html)); Health Atlas rule (no threshold in the source): 1 band |
| Sleep | NASA document: 2 bands ([NASA-STD-3001 Technical Brief OCHMO-TB-041](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-041-sleep-accommodations.pdf)); Health Atlas rule (no threshold in the source): 2 bands |
| Mood | NASA document: 1 band ([NASA-STD-3001 Technical Brief OCHMO-TB-016](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf)); Health Atlas rule (no threshold in the source): 2 bands |
| Reaction time | NASA document: 1 band ([NASA-STD-3001 Technical Brief OCHMO-TB-016](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-016-behavioral-health.pdf)) |
| Exercise | NASA document: 1 band ([Astronaut Exercise](https://www.nasa.gov/missions/station/iss-research/astronaut-exercise)); Health Atlas rule (no threshold in the source): 1 band |
| Water | NASA document: 2 bands ([Nutrition Requirements, Standards, and Operating Bands for Exploration Missions](https://ntrs.nasa.gov/api/citations/20200001703/downloads/20200001703.pdf)) |
| Radiation | NASA document: 2 bands ([NASA-STD-3001 Technical Brief OCHMO-TB-020](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf)); Health Atlas rule (no threshold in the source): 1 band |
| Cabin CO₂ | NASA document: 4 bands ([NASA-STD-3001 Technical Brief OCHMO-TB-004](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf), [CO2 on the International Space Station](https://ntrs.nasa.gov/api/citations/20150019624/downloads/20150019624.pdf)) |

## Experience (no decisions)

- Earth gallery: Earth photos from the EPIC camera (Mental health → Support library): [EPIC](https://epic.gsfc.nasa.gov/about/api)


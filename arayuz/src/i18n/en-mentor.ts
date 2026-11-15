import type { trMentor } from './tr-mentor'
import type { Widen } from './tr'

/** English texts for the mentor-form additions (merged into en.ts). Must match tr-mentor.ts. */
export const enMentor: Widen<typeof trMentor> = {
  badge: {
    nasa: 'NASA',
    nasaTitle: 'The source of this information is a NASA document or NASA data',
  },

  about: {
    tabsLabel: 'Sections of the Sources dialog',
    tabs: { sources: 'Sources', nasa: 'NASA data', feasibility: 'Feasibility', roadmap: 'Roadmap' },

    nasa: {
      title: 'Where does NASA data make decisions?',
      summary: (sources: number, nasaSources: number, nasaIndicators: number, indicators: number, datasets: number) =>
        `${sources} verified sources (${nasaSources} from NASA) · ${nasaIndicators} of ${indicators} indicators have at least one threshold based on a NASA document · ${datasets} NASA datasets`,
      thresholds: 'Indicator thresholds',
      thresholdsDesc: "Each indicator's status bands and what they are based on. The list is generated from the indicator catalog.",
      kinds: { nasa: 'NASA document', medical: 'Medical source', rule: 'Health Atlas rule' },
      bands: (n: number) => `${n} ${n === 1 ? 'band' : 'bands'}`,
      ruleNote: 'Health Atlas rule: the source has no such threshold; it was set for the prototype and a flight surgeon would set it in real use.',
      decisions: 'Decisions and experience',
      cols: { what: 'Decision', where: 'In the app', data: 'NASA data', source: 'Source' },
      experience: 'Experience',
      decision: 'Decision',
    },

    feasibility: {
      lead: 'Health Atlas needs no new hardware or paid software; the real costs are development effort and, for real use, medical software approval and flight certification.',
      cols: { item: 'Item', today: 'Today', real: 'In real use', basis: 'Basis' },
      rows: [
        {
          item: 'Development',
          today: 'Open-source tools (TypeScript, React, three.js, Node.js, SQLite); no licence fees, the cost is team effort',
          real: 'A small software team for maintenance and validation',
          basis: 'Software licences (Sources tab)',
        },
        {
          item: 'Hardware',
          today: 'No new hardware; runs in a browser (tablet, laptop)',
          real: 'Sensor data comes from existing wearables (e.g. CSA Bio-Monitor)',
          basis: 'CSA Bio-Monitor',
        },
        {
          item: 'Software and model licences',
          today: 'MIT, Apache 2.0, ISC; anatomy model CC BY-SA 4.0; trainer model CC0; equipment models CC BY 3.0 and CC0',
          real: 'Same; no fees',
          basis: 'Sources tab',
        },
        {
          item: 'Data',
          today: 'NASA DONKI, EPIC and OSDR are public; DONKI and EPIC are fetched without an API key, with an embedded snapshot when offline',
          real: 'Same',
          basis: 'DONKI, EPIC, OSDR',
        },
        {
          item: 'Operations',
          today: 'A single-process Node.js server and SQLite; works offline; no cloud services',
          real: 'One server on the ground or the computer on board',
          basis: 'Architecture (README)',
        },
        {
          item: 'Language model',
          today: 'Not connected; the assistant is offline and rule-based',
          real: "Optional and the only usage-based cost; if turned off, the offline answers keep working",
          basis: "No price given (the provider's official price page was not verified)",
        },
        {
          item: 'Moving to real use',
          today: 'None (prototype)',
          real: "Medical software approval, a cybersecurity audit and flight certification; the cost depends on the agency's process",
          basis: 'No figure given',
        },
      ],
      funding: 'Resources and funding',
      fundingText:
        "NASA's Human Research Program tracks and studies the health risks of spaceflight, and the Canadian Space Agency develops wearable systems that measure crew health. Health Atlas addresses the same problem. Because every component is openly licensed, agencies, universities and analog mission teams can reuse the code and contribute.",
      sustain: 'Economic sustainability',
      sustainItems: [
        'Thresholds live in one file (the indicator catalog): a flight surgeon changes them, and the UI, analysis, report and assistant read from the same file.',
        'When NASA data changes, only the snapshot is refreshed (npm run nasa:snapshot); the code does not change.',
        "The same tool can be reused in NASA's analog missions on Earth (the HERA habitat; in CHAPEA a crew of four lives in Mars Dune Alpha for a year).",
      ],
      honesty: "This table assesses a hackathon prototype; the real cost depends on the agency's requirements and approval process.",
    },

    roadmap: {
      title: 'Limitations and roadmap',
      desc: 'Current limitations, what real use needs and what is already in place in the app.',
      cols: { today: 'Today', real: 'In real use', ready: 'Already in the app' },
      rows: [
        {
          today: 'Crew data comes from a simulation',
          real: 'Sensor and medical device data enter through the import layer',
          ready: 'Data import screen (CSV/JSON, column mapping, unit conversion); an imported series replaces the simulation in its time range',
        },
        {
          today: 'No authentication; the role is chosen in the browser',
          real: 'Sessions and role checks on the server, encrypted storage',
          ready: 'Every action goes through a single RPC layer on the server; checks are added in one place',
        },
        {
          today: 'The assistant is offline and rule-based',
          real: 'A language model is connected through the server; the key never reaches the browser',
          ready: 'The crisis rule and action buttons work without the language model and are tested',
        },
        {
          today: 'Some thresholds are Health Atlas rules (the source has no threshold); SpO₂ and blood sugar use general clinical thresholds',
          real: 'A flight surgeon sets the thresholds',
          ready: 'Thresholds live in one file; the basis of each band is written down and shown in the "NASA data" tab',
        },
        {
          today: 'Delayed contact with the flight surgeon is simulated',
          real: 'A real communication link (e.g. delay-tolerant networking)',
          ready: 'Delay and blackout logic is in the engine; messages wait in a queue',
        },
        {
          today: 'It does not diagnose',
          real: 'An approval process as a decision-support tool',
          ready: 'A "does not diagnose" note on the screens and in the report',
        },
        {
          today: 'Tests: unit and component (Vitest), end-to-end and accessibility (Playwright, axe)',
          real: 'Independent clinical validation',
          ready: 'Automated test suite',
        },
      ],
      tests: (unit: number, e2e: number) => `${unit} unit and component tests, ${e2e} end-to-end tests (all passed in the last run)`,
      steps: 'Next three steps',
      stepItems: [
        "A pilot in an analog mission: a trial with a real crew in NASA isolation studies such as HERA or CHAPEA.",
        'Validation with real sensor data and thresholds set with a flight surgeon.',
        'A security audit and medical software approval.',
      ],
    },
  },

  importer: {
    open: 'Import data',
    openTip: 'Load measurements from a CSV or JSON file',
    title: 'Import data',
    subtitle: (name: string) => `Upload a measurement file for ${name}. Imported values replace the simulation in the time range they cover.`,
    close: 'Close',
    steps: ['File', 'Mapping', 'Preview'],
    stepOf: (n: number, total: number, name: string) => `Step ${n}/${total}: ${name}`,
    choose: 'Choose file',
    drop: 'Drop the file here or choose one (.csv, .json; up to 2 MB)',
    sample: 'Sample files',
    sampleCsv: 'Heart rate sample (CSV, synthetic)',
    sampleJson: 'Blood sugar sample (JSON, mmol/L, synthetic)',
    readError: 'The file could not be read.',
    tooBig: 'The file is larger than 2 MB.',
    badType: 'Only .csv and .json files can be uploaded.',
    parseError: 'No readable rows were found. In CSV the first row must be the column names; JSON must be a list of objects.',
    loaded: (name: string, rows: number) => `${name} · ${rows} rows`,
    indicator: 'Indicator',
    timeColumn: 'Time column',
    valueColumn: 'Value column',
    value2Column: 'Second value column (diastolic)',
    unit: 'Unit in the file',
    unitSame: (u: string) => `Catalog unit (${u})`,
    unitNames: { F: '°F (Fahrenheit)', C: '°C', 'mmol/L': 'mmol/L', 'mg/dL': 'mg/dL', min: 'minutes', h: 'hours' } as Record<string, string>,
    dataset: 'Dataset name',
    datasetHint: 'Shown under this name in the Sources dialog',
    provider: 'Source (organisation)',
    url: 'Link (optional)',
    astronaut: (name: string) => `Astronaut: ${name}`,
    previewTitle: 'First 10 rows',
    colTime: 'Time',
    colRaw: 'Value in file',
    colValue: 'To import',
    valid: (n: number) => `${n} valid ${n === 1 ? 'row' : 'rows'}`,
    invalid: (n: number) => `${n} ${n === 1 ? 'row' : 'rows'} will be skipped`,
    reasons: { time: 'time could not be read', value: 'value invalid or out of range' } as Record<string, string>,
    row: (n: number) => `Row ${n}`,
    range: (from: string, to: string) => `Time range covered: ${from} – ${to}`,
    back: 'Back',
    next: 'Continue',
    submit: 'Import',
    importing: 'Importing',
    done: (n: number, skipped: number) => (skipped ? `${n} records imported (${skipped} rows skipped)` : `${n} records imported`),
    failed: 'Import failed: no valid rows or the format could not be read.',
    readOnly: "An astronaut's data must be open to import.",
    by: { astronaut: 'astronaut', surgeon: 'flight surgeon' } as Record<string, string>,
  },
}

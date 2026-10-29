# Implementation decisions

- Tailwind palette: near-black ink, warm paper text, and amber actions, with muted moss accents in the evidence room.
- Request logging: lightweight structured JSON error/request-id logging rather than adding `pino-http` in the first scaffold.
- My Cases pagination defaults to 10 items.
- Mock cases use an in-memory store when `MOCK_GEMINI=true`, allowing local exploration without a MongoDB daemon. MongoDB connection is attempted in the background and persistence schemas/connection can be expanded in the next milestone.
- Fixture-driven case generation is intentionally deterministic; the Gemini and image adapters are staged for the real generation milestone.

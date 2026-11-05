# AGENTS.md — Poroto Petchop Servidor

This repository is the backend API for the Poroto kiosk/pet-shop POS system.

## Quick start
- `npm install`
- Create `.env` (see docs/AI_CONTEXT.md section 6).
- `npm run dev` (port 5000) or `npm start`.
- Seed: `npm run seed`.

## Understand the project
- Read `docs/AI_CONTEXT.md` for architecture, models, routes, flows, conventions, pitfalls.
- Skill: `.claude/skills/poroto-servidor/SKILL.md` (also `.agents/skills/poroto-servidor/SKILL.md`).

## Stack
Node.js (CommonJS), Express 5, Mongoose 9, MongoDB Atlas, JWT, bcryptjs.

## Structure
`src/models`, `src/controllers`, `src/routes`, `src/middlewares`, `src/utils`, `src/config`, `src/seeds`. Entry `server.js`.

## Conventions
- Each resource: model + controller + route; register route in `server.js`.
- Use `protect`/`admin` middlewares; admin-only uses both.
- Stock changes write `StockMovement`.
- Dates in Argentina (UTC-3).
- Do not commit `.env`.

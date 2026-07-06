# Initial GitHub Issue Seed List

Use this list to seed GitHub Issues if the GitHub CLI setup needs to be repeated manually.

## Milestones

- M1 Stabilize Deployed App
- M2 Scientific Rendering Audit
- M3 Frontend Refactor Foundation
- M4 Surface + Expanded Variables
- M5 Production Readiness

## Initial Issues

### M1 Stabilize Deployed App

1. Document Render deployment settings and environment variables
2. Add smoke-test recipes for 3-hourly, daily, monthly, and anomaly modes
3. Add user-facing climatology/source disclaimer

### M2 Scientific Rendering Audit

4. Audit upper-air temperature color scales
5. Validate wind-speed mid/high color scales
6. Decide climatology source policy with domain expert

### M3 Frontend Refactor Foundation

7. Extract time controls from `App.tsx`
8. Extract variable/level controls from `App.tsx`
9. Extract Color Lab from `App.tsx`

### M5 Production Readiness

10. Configure `PYRE_CACHE_DIR`
11. Add cache cleanup/bounds policy
12. Add request/rate guards for public deployment


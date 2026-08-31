## 2026-08-30T10:16:04Z
Implement Milestone 2 (R2: Lossless AST Level & Placement Editor):
- Dependencies: recast, @babel/parser, @types/recast, three-mesh-bvh
- tools/layout-editor/patchPlacement.ts: lossless AST codemodding with recast, preserve comments/formatting, mutations (add, update, delete, batch), atomic write safety (.tmp + parse validation).
- src/layout-editor/TerrainSnapping.ts: snapToTerrain, BVH/raycast, height calculation, normal vector alignment, slope detection.
- src/layout-editor/history/HistoryManager.ts: Command pattern undo/redo, transaction batching, dirty tracking, max depth.
- src/app/PlacementEditor.ts & src/layout-editor/: integrate TerrainSnapping & HistoryManager.
- Unit Tests: tests/unit/patchPlacement.test.ts, tests/unit/terrainSnapping.test.ts, tests/unit/historyManager.test.ts.
- Verification: npm run typecheck, npm run test.
- Report: handoff.md and send message back to parent.

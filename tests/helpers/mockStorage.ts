// Shared mock state for server/storage.
// Import mockState in test files to control what requireRole sees from the DB.
//
// Usage in a test file:
//   vi.mock("server/storage", async () => {
//     const { mockState } = await import("../../helpers/mockStorage");
//     const mockBuilder = { from: ..., limit: vi.fn().mockImplementation(() => {
//       if (mockState.shouldThrow) return Promise.reject(mockState.error ?? new Error("DB error"));
//       return Promise.resolve(mockState.roleRows);
//     })};
//     return { db: { select: vi.fn().mockReturnValue(mockBuilder) } };
//   });

export const mockState = {
    roleRows: [] as { roleName: string }[],
    shouldThrow: false,
    error: null as Error | null,
};

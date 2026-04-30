// Jest stub — tests that need real SQL inject their own mock DB via ../database
module.exports = {
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(),
    runAsync: jest.fn(async () => ({ lastInsertRowId: 1 })),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    withTransactionAsync: jest.fn(async cb => cb()),
  })),
};

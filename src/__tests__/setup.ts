import 'jest';

global.fetch = jest.fn();

global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

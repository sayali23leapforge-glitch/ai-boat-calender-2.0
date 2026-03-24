/**
 * Global error handlers to prevent ELIFECYCLE crashes
 * These catch unhandled rejections and uncaught exceptions
 */

// Prevent unhandled promise rejections from crashing the process
process.on("unhandledRejection", (reason, promise) => {
  console.error("[GlobalHandler] Unhandled Rejection at:", promise, "reason:", reason);
  // Continue running instead of crashing
});

// Prevent uncaught exceptions from crashing the process
process.on("uncaughtException", (error) => {
  console.error("[GlobalHandler] Uncaught Exception:", error);
  // Log but don't exit - let the process continue
  // In production, you might want to log to a service and possibly restart gracefully
});

// Handle warnings
process.on("warning", (warning) => {
  console.warn("[GlobalHandler] Warning:", warning.name, warning.message);
});

console.log("[GlobalHandler] Global error handlers registered");

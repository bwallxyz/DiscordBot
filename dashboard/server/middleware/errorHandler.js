// server/middleware/errorHandler.js
/**
 * Global error handling middleware
 */

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);
    console.error(err.stack);
    
    const statusCode = err.statusCode || 500;
    
    res.status(statusCode).json({
      error: err.message || 'Internal Server Error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  };
  
  module.exports = errorHandler;
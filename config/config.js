// Configuration loader
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Default configuration path
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'default.json');

// Load configuration from JSON file
function loadConfigFromFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    logger.error(`Error loading config from ${filePath}:`, error);
    return null;
  }
}

// Load default configuration
function loadDefaultConfig() {
  return loadConfigFromFile(DEFAULT_CONFIG_PATH) || {};
}

// Load custom configuration and merge with defaults
function loadConfig(customConfigPath) {
  const defaultConfig = loadDefaultConfig();
  
  if (!customConfigPath) {
    return defaultConfig;
  }
  
  const customConfig = loadConfigFromFile(customConfigPath);
  
  if (!customConfig) {
    return defaultConfig;
  }
  
  // Merge custom config with default config
  return { ...defaultConfig, ...customConfig };
}

module.exports = {
  loadConfig,
  loadDefaultConfig
};
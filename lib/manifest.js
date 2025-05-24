import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Helper function for environment variable interpolation
function interpolateString(value) {
  if (typeof value !== 'string') {
    return value;
  }
  // Regex to find $VAR_NAME or ${VAR_NAME}
  return value.replace(/\$([A-Z_][A-Z0-9_]*)|\$\{([A-Z_][A-Z0-9_]*)\}/ig, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    const envValue = process.env[varName];
    if (typeof envValue === 'string') {
      return envValue;
    }
    console.warn(`Environment variable $${varName} not found. Replacing with empty string.`);
    return '';
  });
}

// Recursively interpolate string values in the config object
function interpolateConfig(obj) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (typeof obj[key] === 'string') {
        obj[key] = interpolateString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        interpolateConfig(obj[key]);
      }
    }
  }
}

function validateManifest(config, filePath, { VALIDATE_FLAG, SERVE_FLAG, shouldStartServer }) {
  const errors = [];
  if (typeof config.username !== 'string' || !config.username.trim()) {
    errors.push(chalk.red('Field "username": Missing or invalid. Must be a non-empty string. Path: ' + chalk.cyan('username')));
  }
  if (typeof config.base_url !== 'string' || !config.base_url.trim()) {
    errors.push(chalk.red('Field "base_url": Missing or invalid. Must be a non-empty string. Path: ' + chalk.cyan('base_url')));
  }
  if (!Array.isArray(config.tools)) {
    errors.push(chalk.red('Field "tools": Missing or invalid. Must be an array. Path: ' + chalk.cyan('tools')));
  } else if (config.tools.length === 0 && (VALIDATE_FLAG || SERVE_FLAG || shouldStartServer) ) {
    if (VALIDATE_FLAG) {
        errors.push(chalk.red('Field "tools": Array must contain at least one tool when using --validate. Path: ' + chalk.cyan('tools')));
    } else if (SERVE_FLAG || shouldStartServer) {
        // This case might be too strict if a user wants to run a server with no tools initially.
        // For now, keeping it consistent with the idea that a "tool server" should have tools.
    }
  } else if (config.tools.length > 0) { // Only iterate if tools array is not empty
    const toolNames = new Set();
    config.tools.forEach((tool, index) => {
      const toolIdentifier = tool.name && typeof tool.name === 'string' ? chalk.magenta(`"${tool.name}" (index ${index})`) : chalk.magenta(`at index ${index}`);
      const toolPathPrefix = chalk.cyan(`tools[${index}]`);

      if (typeof tool.name !== 'string' || !tool.name.trim()) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "name": Missing or invalid. Must be a non-empty string. Path: ${toolPathPrefix}.name`));
      } else {
        if (toolNames.has(tool.name)) {
          errors.push(chalk.red(`Tool ${toolIdentifier}: Duplicate tool name ${chalk.yellow(`"${tool.name}"`)}. Tool names must be unique. Path: ${toolPathPrefix}.name`));
        }
        toolNames.add(tool.name);
      }
      if (typeof tool.description !== 'string' || !tool.description.trim()) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "description": Missing or invalid. Must be a non-empty string. Path: ${toolPathPrefix}.description`));
      }
      if (typeof tool.webhook !== 'string' || !tool.webhook.trim()) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "webhook": Missing or invalid. Must be a non-empty string. Path: ${toolPathPrefix}.webhook`));
      }
      if (typeof tool.input !== 'object' || tool.input === null) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "input": Missing or invalid. Must be an object. Path: ${toolPathPrefix}.input`));
      }
      if (typeof tool.output !== 'object' || tool.output === null) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "output": Missing or invalid. Must be an object. Path: ${toolPathPrefix}.output`));
      }
    });
  }

  if (errors.length > 0) {
    console.error(chalk.bold.red(`\nValidation errors found in ${chalk.underline(path.basename(filePath))}:`));
    errors.forEach(err => console.error(chalk.yellow(`  ✖ ${err}`)));
    if (errors.some(err => err.includes("Duplicate tool name"))) {
        console.error(chalk.bold.red('\nCritical error: Duplicate tool names found. Please ensure all tool names are unique.'));
        process.exit(1);
    }
    return false;
  }
  return true;
}

function loadManifest(manifestFilePath, { VALIDATE_FLAG, SERVE_FLAG, shouldStartServer, configFlagUsed, INIT_FLAG }) {
  const resolvedPath = path.resolve(process.cwd(), manifestFilePath);
  if (!VALIDATE_FLAG) {
    console.log(`Attempting to load manifest from: ${resolvedPath}`);
  }

  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: Manifest file ${resolvedPath} not found.`));
    if (manifestFilePath === 'wyreup.json' && !configFlagUsed && !VALIDATE_FLAG) {
        const defaultManifestPath = path.resolve(process.cwd(), 'wyreup.json');
        const defaultConfig = {
            username: "default-user",
            base_url: "http://localhost:5678/webhook/",
            tools: []
        };
        fs.writeFileSync(defaultManifestPath, JSON.stringify(defaultConfig, null, 2));
        console.log(chalk.yellow(`Created a default ${defaultManifestPath}. Please configure it.`));
        return defaultConfig;
    } else if (manifestFilePath === 'wyreup.json' && !configFlagUsed && VALIDATE_FLAG) {
        console.log(chalk.yellow(`You can create a default 'wyreup.json' by running: wyreup-mcp --init`));
    }
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(resolvedPath);
    let parsedConfig = JSON.parse(rawData);
    interpolateConfig(parsedConfig);

    if (!validateManifest(parsedConfig, resolvedPath, { VALIDATE_FLAG, SERVE_FLAG, shouldStartServer })) {
      if (VALIDATE_FLAG) {
        console.error(chalk.red.bold('\nManifest invalid. Please check the errors above.'));
      } else {
        console.error(chalk.red.bold(`\nManifest ${resolvedPath} is invalid. Server cannot start.`));
      }
      process.exit(1);
    }
    if (!VALIDATE_FLAG) {
        console.log(chalk.green(`Loaded and validated tool manifest from ${resolvedPath}`));
    }
    return parsedConfig;
  } catch (error) {
    console.error(chalk.red(`Error processing manifest file ${resolvedPath}: ${error.message}`));
    process.exit(1);
  }
}

export {
    loadManifest,
    interpolateConfig,
    validateManifest,
    interpolateString // Exporting for potential direct use if needed elsewhere, though primarily internal
};
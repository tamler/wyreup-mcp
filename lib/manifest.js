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
      if (typeof tool.url !== 'string' || !tool.url.trim()) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "url": Missing or invalid. Must be a non-empty string. Path: ${toolPathPrefix}.url`));
      }
      // public is optional, so no validation needed unless specific rules apply.
      if (typeof tool.input !== 'object' || tool.input === null) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "input": Missing or invalid. Must be an object. Path: ${toolPathPrefix}.input`));
      }
      if (typeof tool.output !== 'object' || tool.output === null) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Field "output": Missing or invalid. Must be an object. Path: ${toolPathPrefix}.output`));
      }
      // Validate method field
      if (tool.method && typeof tool.method === 'string') {
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        if (!validMethods.includes(tool.method.toUpperCase())) {
          errors.push(chalk.red(`Tool ${toolIdentifier}: Field "method": Must be one of ${validMethods.join(', ')}. Path: ${toolPathPrefix}.method`));
        }
      }
      // Validate auth and authFrom (mutually exclusive)
      const hasAuth = tool.hasOwnProperty('auth');
      const hasAuthFrom = tool.hasOwnProperty('authFrom');
      
      if (hasAuth && hasAuthFrom) {
        errors.push(chalk.red(`Tool ${toolIdentifier}: Fields "auth" and "authFrom" are mutually exclusive. Use only one. Path: ${toolPathPrefix}`));
      }
      
      if (hasAuth) { // Check if auth property exists
        const toolAuthPath = `${toolPathPrefix}.auth`;
        if (typeof tool.auth !== 'object' || tool.auth === null) {
          errors.push(chalk.red(`Tool ${toolIdentifier}: Field "auth": Must be an object if defined. Path: ${toolAuthPath}`));
        } else {
          const validTypes = ['header', 'jwt'];
          if (typeof tool.auth.type !== 'string' || !tool.auth.type.trim()) {
            errors.push(chalk.red(`Tool ${toolIdentifier}: Field "auth.type": Missing or invalid. Must be a non-empty string. Path: ${toolAuthPath}.type`));
          } else if (!validTypes.includes(tool.auth.type)) {
            errors.push(chalk.red(`Tool ${toolIdentifier}: Field "auth.type": Must be one of ${validTypes.join(', ')}. Path: ${toolAuthPath}.type`));
          } else {
            switch (tool.auth.type) {
              case 'header':
                if (typeof tool.auth.name !== 'string' || !tool.auth.name.trim()) {
                  errors.push(chalk.red(`Tool ${toolIdentifier}: Field "auth.name": Required and must be a non-empty string for header auth. Path: ${toolAuthPath}.name`));
                }
                if (typeof tool.auth.value !== 'string' || !tool.auth.value.trim()) { // Value can be empty, but must be a string if provided
                  errors.push(chalk.red(`Tool ${toolIdentifier}: Field "auth.value": Required and must be a string for header auth. Path: ${toolAuthPath}.value`));
                }
                break;
              case 'jwt':
                if (typeof tool.auth.token !== 'string' || !tool.auth.token.trim()) {
                  errors.push(chalk.red(`Tool ${toolIdentifier}: Field "auth.token": Required and must be a non-empty string for jwt auth. Path: ${toolAuthPath}.token`));
                }
                break;
            }
          }
        }
      }
      
      if (hasAuthFrom) { // Check if authFrom property exists
        const toolAuthFromPath = `${toolPathPrefix}.authFrom`;
        if (typeof tool.authFrom !== 'object' || tool.authFrom === null) {
          errors.push(chalk.red(`Tool ${toolIdentifier}: Field "authFrom": Must be an object if defined. Path: ${toolAuthFromPath}`));
        } else {
          if (typeof tool.authFrom.user !== 'string' || !tool.authFrom.user.trim()) {
            errors.push(chalk.red(`Tool ${toolIdentifier}: Field "authFrom.user": Required and must be a non-empty string. Path: ${toolAuthFromPath}.user`));
          }
        }
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
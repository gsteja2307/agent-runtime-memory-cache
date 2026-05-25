const { execSync } = require('child_process');
const { name, version } = require('../package.json');

console.log(`Checking version for ${name}@${version}...`);

try {
  // Fetch the latest published version from NPM
  const publishedVersion = execSync(`npm view ${name} version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

  // Simple string comparison for equality. If it's the exact same, we throw an error.
  if (publishedVersion === version) {
    console.error(`\n❌ Error: Version ${version} is already published on NPM.`);
    console.error(`Please increment the version in package.json before running npm publish.`);
    console.error(`You can use 'npm version patch', 'npm version minor', or 'npm version major'.\n`);
    process.exit(1);
  } else {
    console.log(`✅ Version ${version} is ready to be published (Current NPM version is ${publishedVersion}).`);
  }
} catch (err) {
  // If npm view fails, it usually means the package has never been published.
  console.log(`ℹ️ Package ${name} might not be published yet, or there is no internet connection. Proceeding...`);
}

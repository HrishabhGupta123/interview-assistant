const { rcedit } = require('rcedit');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName === 'win32') {
    const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
    const iconPath = path.join(context.packager.projectDir, 'icon.ico');
    console.log(`[afterPack] Embedding custom multi-resolution icon.ico into ${exePath}...`);
    try {
      await rcedit(exePath, {
        icon: iconPath,
        'version-string': {
          CompanyName: 'Interview Assistant',
          FileDescription: 'Interview Assistant',
          ProductName: 'Interview Assistant'
        }
      });
      console.log('[afterPack] SUCCESS! Custom multi-resolution icon.ico embedded into PE binary!');
    } catch (e) {
      console.error('[afterPack] Error embedding icon:', e);
    }
  }
};

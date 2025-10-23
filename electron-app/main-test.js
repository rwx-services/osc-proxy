console.log('Loading electron...');
const { app, BrowserWindow, ipcMain } = require('electron');
console.log('Electron loaded');
console.log('ipcMain type:', typeof ipcMain);

if (ipcMain) {
  console.log('ipcMain is available');
  ipcMain.handle('test', () => {
    return { success: true };
  });
  console.log('Handler registered');
} else {
  console.log('ipcMain is NOT available');
}

app.whenReady().then(() => {
  console.log('App ready!');
  setTimeout(() => app.quit(), 1000);
});

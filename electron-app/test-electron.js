console.log('Step 1: Loading electron...');
const electron = require('electron');
console.log('Step 2: Electron loaded:', typeof electron);
console.log('Step 3: ipcMain type:', typeof electron.ipcMain);

const { app, BrowserWindow, ipcMain, Menu, Tray } = electron;
console.log('Step 4: After destructuring, ipcMain type:', typeof ipcMain);

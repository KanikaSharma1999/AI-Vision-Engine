import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'serverUrl';

export async function getServerUrl() {
  try {
    return (await AsyncStorage.getItem(SERVER_URL_KEY)) || '';
  } catch (e) {
    console.warn('Failed to read server URL from storage', e);
    return '';
  }
}

export async function setServerUrl(url) {
  try {
    await AsyncStorage.setItem(SERVER_URL_KEY, url);
    return true;
  } catch (e) {
    console.warn('Failed to save server URL to storage', e);
    return false;
  }
}

export async function clearServerUrl() {
  try {
    await AsyncStorage.removeItem(SERVER_URL_KEY);
    return true;
  } catch (e) {
    console.warn('Failed to clear server URL from storage', e);
    return false;
  }
}

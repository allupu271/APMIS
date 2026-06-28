import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyC3qfxZGy_UPEEDzFD9_4w7AUNLyzDfAr4',
  authDomain: 'apmis-d0e8a.firebaseapp.com',
  projectId: 'apmis-d0e8a',
  storageBucket: 'apmis-d0e8a.firebasestorage.app',
  messagingSenderId: '176554484893',
  appId: '1:176554484893:android:5ca5b5634a6942a0102074',
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

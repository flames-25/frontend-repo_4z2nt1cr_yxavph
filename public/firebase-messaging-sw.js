/* eslint-disable no-undef */
// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBuFedeWJQ98qZpcLEhwzv3iuo_gt4AYsw',
  authDomain: 'chat-767e2.firebaseapp.com',
  projectId: 'chat-767e2',
  storageBucket: 'chat-767e2.firebasestorage.app',
  messagingSenderId: '791673240575',
  appId: '1:791673240575:web:27cd7ae97e9bfc638745ca',
  measurementId: 'G-WSNH9Y5GK5'
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'New message'
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/icon-192.png'
  }
  self.registration.showNotification(notificationTitle, notificationOptions)
})

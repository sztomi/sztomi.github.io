sendMessageToClient = (message) => {
    self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
            client.postMessage(message);
        });
    });
};

self.addEventListener('install', (_) => {
    console.log('Service Worker installing.');
});

self.addEventListener('fetch', (event) => {
    console.log('Service Worker fetching.', event);
});

self.addEventListener('updateFound', (event) => {
    console.log('Service Worker update found.', event);
    sendMessageToClient({ msg: 'updateFound', payload: event });
});


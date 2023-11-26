function app() {
    return {
        questions: [
            {
                "title": "Helyzet",
                "description": "Mi történt? Mit csináltam? Kivel, milyen helyzetben voltam?",
                "model": "situation",
            },
            {
                "title": "Érzelem, hangulat",
                "description": "Mit éreztem? Érzelem, hangulat erőssége (%)?",
                "model": "emotion",
            },
            {
                "title": "Negatív automatikus gondolatok (NAG)",
                "description": "Milyen gondolat futott át a fejemen, mielőtt rosszul kezdtem érezni magam? Mennyire voltam meggyőződve róluk? (%)",
                "model": "automaticThought"
            },
            {
                "title": "Érvek, tények, hogy a NAG igaz",
                "description": "Mi bizonyítja, hogy igaz a NAG?",
                "model": "evidenceSupporting",
            },
            {
                "title": "Érvek, tények, hogy a NAG <u>nem</u> igaz",
                "description": "Mi szól a NAG ellen? Mi bizonyítja, hogy a NAG nem igaz?",
                "model": "evidenceAgainst",
            },
            {
                "title": "Kiegyensúlyozottabb, reálisabb gondolat",
                "description": "Hogyan válaszolom meg a negatív automatikus gondolatot? Hogyan lehet reálisabban értékelni a helyzetet?",
                "model": "alternativeThought",
            },
            {
                "title": "Új érzés vagy régi érzés újraértékelése",
                "description": "Mit érzek most? Hogyan változott meg az érzésem (%)?",
                "model": "outcome",
            },
            {
                "title": "Cím (opcionális)",
                "description": "Itt adhatsz egy címet a bejegyzésednek (ha nem adsz, akkor a dátum alapján tudod később megtalálni).",
                "model": "title",
            }
        ],
        records: JSON.parse(localStorage.getItem('thoughtRecords') || '[]'),
        currentRecord: {
            title: '',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            situation: '',
            emotion: '',
            automaticThought: '',
            evidenceSupporting: '',
            evidenceAgainst: '',
            alternativeThought: '',
            outcome: ''
        },
        currentIndex: null,
        currentQuestion: 0,
        view: 'list',
        hasChanges: false,

        init() {
            this.hasUpdate = false;
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/service-worker.js')
                    .then(sw => {
                        console.log('ServiceWorker registration successful with scope: ', sw.scope);
                        sw.update();
                    }, err => {
                        console.log('ServiceWorker registration failed: ', err);
                    });

                navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage);
            }
            this.checkForUpdate();
        },

        // Method to handle messages from the service worker
        handleServiceWorkerMessage(event) {
            console.log('Message from the service worker:', event.data.msg);
            if (event.data.msg === 'updateFound') {
                this.handleUpdate(event.data.payload);
            }
            else if (event.data.msg === 'activate') {
                this.checkForUpdate();
            }
        },

        get hasUpdate() {
            return Alpine.store('hasUpdate');
        },

        set hasUpdate(value) {
            Alpine.store('hasUpdate', value);
        },

        get version() {
            return JSON.parse(localStorage.getItem('version') || '{ "version": 0 }');
        },

        set version(value) {
            localStorage.setItem('version', JSON.stringify(value));
        },

        refreshApp() {
            if (this.confirmNavigation()) {
                console.log('Refreshing app...');
                fetch("/version.json")
                    .then(response => response.json())
                    .then(version => {
                        console.log('Storing version:', version);
                        this.version = version;
                        window.location.reload();
                    });
            }
        },

        checkForUpdate() {
            fetch("/version.json")
                .then(response => response.json())
                .then(version => {
                    console.log('Version:', version);
                    if (this.version.version !== version.version) {
                        console.log('New version available!');
                        this.hasUpdate = true;
                    }
                });
        },

        handleUpdate(message) {
            console.log('Update message:', message);
            this.hasUpdate = true;
        },

        updateAvailable() {
            return this.hasUpdate;
        },

        goToAddView() {
            this.resetCurrentRecord();
            this.view = 'edit';
        },

        goToEditView(index) {
            this.currentRecord = { ...this.records[index] };
            this.currentIndex = index;
            this.view = 'edit';
        },

        goToHelpView() {
            this.view = 'help';
        },

        goToListView() {
            if (this.confirmNavigation()) {
                this.resetCurrentRecord();
                this.view = 'list';
            }
        },

        nextQuestion() {
            if (this.currentQuestion < 7) {
                this.currentQuestion++;
            }
        },

        previousQuestion() {
            if (this.currentQuestion > 0) {
                this.currentQuestion--;
            }
        },

        resetCurrentRecord() {
            this.currentRecord = {
                title: '',
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                situation: '',
                emotion: '',
                automaticThought: '',
                evidenceSupporting: '',
                evidenceAgainst: '',
                alternativeThought: '',
                outcome: ''
            };
            this.currentIndex = null;
            this.currentQuestion = 0;
            this.hasChanges = false;
        },

        saveRecord() {
            this.currentRecord.modified = new Date().toISOString();
            if (this.currentIndex !== null) {
                this.records[this.currentIndex] = this.currentRecord;
            } else {
                this.records.push(this.currentRecord);
            }
            localStorage.setItem('thoughtRecords', JSON.stringify(this.records));
            this.hasChanges = false;
            this.goToListView();
        },

        deleteRecord(index) {
            this.records.splice(index, 1);
            localStorage.setItem('thoughtRecords', JSON.stringify(this.records));
        },

        confirmNavigation() {
            if (this.hasChanges) {
                return confirm("A változások nem lesznek mentve. Biztosan folytatod?");
            }
            return true;
        },

        changeDetected() {
            this.hasChanges = true;
        },

        formatDate(isoString) {
            const date = new Date(isoString);
            return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        },

        currentModelValue() {
            return this.currentRecord[this.questions[this.currentQuestion].model];
        },

        setCurrentModelValue(value) {
            this.currentRecord[this.questions[this.currentQuestion].model] = value;
        },

        getTitle(index) {
            const record = this.records[index];
            // If there is a title, return it.
            if (!!record.title) {
                return record.title;
            }
            // Else, return the first 20 characters of the situation.
            return record.situation.substring(0, 20) + " ...";
        },

        getLastModified(index) {
            const record = this.records[index];
            if (record.modified) {
                return this.formatDate(record.modified);
            }
            return record.created;
        },

        exportData() {
            if (navigator.canShare) {
                const data = JSON.stringify(this.records, null, 2); // Prettify the JSON
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                navigator.share({
                    title: 'Thought Records Export',
                    text: 'Here is the exported thought records.',
                    url: url,
                })
                    .then(() => console.log('Successful share'))
                    .catch((error) => console.log('Error sharing:', error))
                    .finally(() => {
                        // Cleanup by revoking the object URL after sharing.
                        URL.revokeObjectURL(url);
                    });
            } else {
                alert('Web Share API not supported on this browser/device.');
            }
        },
    }
}

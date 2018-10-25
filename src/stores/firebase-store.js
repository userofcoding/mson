// NOTE: Firebase doesn't support complex quering like most DBs (
// https://firebase.google.com/docs/firestore/query-data/queries). Therefore, we will do all the
// querying in memory. In the future we may want to support a minimal set of queries against the
// firestore DB so that we have the option of working with larger datasets.

import MemoryStore from './memory-store';
import cloneDeep from 'lodash/cloneDeep';

export default class FirebaseStore extends MemoryStore {
  _className = 'FirebaseStore';

  // React to real-time changes made remotely
  async _listenToChanges() {
    // We order by createdAt as per https://firebase.google.com/docs/firestore/manage-data/add-data,
    // "Firestore auto-generated IDs do not provide any automatic ordering. If you want to be able
    // to order your documents by creation date, you should store a timestamp as a field in the
    // documents." We can only order by a single attribute (unless we create an index) so we'll pick
    // the order.
    this._coll.orderBy('createdAt').onSnapshot(
      snapshot => {
        snapshot.docChanges().forEach(change => {
          const data = change.doc.data();
          if (change.type === 'removed') {
            this._docs.delete(data.id);
          } else {
            this._docs.set(data.id, data);
          }
        });

        // First load?
        if (!this.isLoaded()) {
          // Emit on next tick so that caller has a change to listen
          setTimeout(() => {
            this._emitDidLoad();
          });
        }
      },
      err => {
        this._emitError(err);
      }
    );
  }

  // async _loadDocs() {
  //   const docs = await this._coll.get();
  //   docs.forEach(doc => {
  //     const doc = doc.data();
  //     this._docs.set(doc.id, doc);
  //   });
  // }

  _getFirebase(props) {
    return props.firebase ? props.firebase : this._global.firebase;
  }

  _initializeApp(props) {
    // Has Firebase been initialized? We must only do this once per app.
    if (!this._fb.apps.length) {
      this._fb.initializeApp({
        apiKey: props.apiKey,
        authDomain: props.authDomain,
        projectId: props.projectId
      });
    }
  }

  async _init(props) {
    this._fb = this._getFirebase(props);

    this._initializeApp(props);

    this._db = this._fb.firestore();

    // Disable warning
    const settings = { timestampsInSnapshots: true };
    this._db.settings(settings);

    this._coll = this._db.collection(props.collection);

    this._listenToChanges();

    // Not needed as we get the docs by listening to the changes
    // await this._loadDocs();
  }

  _create(props) {
    super._create(
      Object.assign({}, props, {
        // Mute didLoad in the base classes as we need to emit didLoad after all the docs have been
        // loaded asynchronously
        muteDidLoad: true
      })
    );

    // For mocking
    this._global = global;

    this.set({
      schema: {
        component: 'Form',
        fields: [
          {
            // For mocking
            name: 'firebase',
            component: 'Field'
          },
          {
            name: 'apiKey',
            component: 'TextField'
          },
          {
            name: 'authDomain',
            component: 'TextField'
          },
          {
            name: 'projectId',
            component: 'TextField'
          },
          {
            name: 'collection',
            component: 'TextField'
          }
        ]
      }
    });

    // Don't actually connect to Firebase unless we specify an API Key
    if (props.apiKey !== undefined) {
      this._init(props);
    }
  }

  async _docSet({ id, doc, options }) {
    // Don't actually connect to Firebase unless we specify an API Key
    if (this.get('apiKey')) {
      // Update the Firebase store
      return this._coll.doc(id).set(doc, options);
    }
  }

  async _createDoc({ fieldValues, id, order }) {
    const doc = this._buildDoc({ fieldValues, id, order });

    await this._docSet({
      id: doc.id,
      doc,
      order: doc.order
    });

    // Note: we need to update the underlying MemoryStore so that the data is there after this
    // function completes even though Firebase will emit an onWrite with the changed data.
    this._docs.set(doc.id, doc);

    return doc;
  }

  async _modifyDoc({ id, fieldValues, archivedAt, order }) {
    // We use cloneDeep so that we don't modify the data in the memory store before we modify the
    // data in the Firebase store. The write to Firebase could always fail.
    let doc = cloneDeep(this._docs.get(id));

    doc = this._setDoc({
      doc,
      fieldValues,
      archivedAt,
      order
    });

    await this._docSet({
      id: doc.id,
      doc,
      options: {
        merge: true // allow for partial updates
      }
    });

    // Note: we need to update the underlying MemoryStore so that the data is there after this
    // function completes even though Firebase will emit an onWrite with the changed data.
    this._docs.set(doc.id, doc);

    return doc;
  }

  async _updateDoc(props) {
    return this._modifyDoc(props);
  }

  async _archiveDoc(props) {
    return this._modifyDoc({
      ...props,
      archivedAt: this._now(),
      order: null
    });
  }

  async _restoreDoc(props) {
    return this._modifyDoc({
      ...props,
      archivedAt: null
    });
  }

  async _waitForDataToBeLoaded() {
    // Wait until the data is first loaded before trying to get it from the underlying MemoryStore
    await this.resolveAfterLoad();
  }

  async _getDoc(props) {
    await this._waitForDataToBeLoaded();
    return super._getDoc(props);
  }

  async _getAllDocs(props) {
    await this._waitForDataToBeLoaded();
    return super._getAllDocs(props);
  }
}

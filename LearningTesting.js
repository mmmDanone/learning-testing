const isPromiseLike = (value) => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function',
  );
};

class CancelablePromise {
  #status = 'pending'; // 'fulfilled' | 'pending' | 'rejected'
  #callbacks = [];
  #value = null;
  #error = null;
  #isCanceled = false;
  #globalError = '';
  #cancel = null;
  #cancelCallbacks = [];

  constructor(executor) {
    if (typeof executor !== 'function') throw new Error('executor is not a function');
    executor(this.#resolve, this.#reject);
  }

  #resolve = (value) => {
    if (this.#status !== 'pending') return;
    if (isPromiseLike(value)) {
      value.then(this.#resolve, this.#reject);
    } else {
      this.#status = 'fulfilled';
      this.#value = value;
      this.#processNextTask();
    }
  };

  #reject = (reason) => {
    if (this.#status !== 'pending') return;
    this.#status = 'rejected';
    this.#error = reason;
    this.#processNextTask();
  };

  then = (thenCallBack, catchCallBack) => {
    if (typeof thenCallBack !== 'function' && typeof thenCallBack !== 'undefined')
      throw new Error('thenCallBack is not a function');
    if (typeof catchCallBack !== 'function' && typeof catchCallBack !== 'undefined')
      throw new Error('catchCallBack is not a function');

    const promise = new CancelablePromise((resolve, reject) => {
      this.#callbacks.push({
        thenCallBack: thenCallBack,
        catchCallBack: catchCallBack,
        resolve: resolve,
        reject: reject,
      });
    });

    this.#cancelCallbacks.push(
      promise.#canceled(() => {
        this.cancel();
      }),
    );
    this.#processNextTask();
    return promise;
  };

  catch = (catchCallBack) => {
    if (typeof catchCallBack !== 'function' && typeof catchCallBack !== 'undefined')
      throw new Error('catchCallBack is not a function');

    const promise = new CancelablePromise((resolve, reject) => {
      this.#callbacks.push({
        thenCallBack: undefined,
        catchCallBack: catchCallBack,
        resolve: resolve,
        reject: reject,
      });
    });

    this.#cancelCallbacks.push(
      promise.#canceled(() => {
        this.cancel();
      }),
    );
    this.#processNextTask();
    return promise;
  };

  cancel = () => {
    this.#cancelCallbacks.forEach((callback) => callback());
    this.#isCanceled = true;
    this.#error = { isCanceled: this.#isCanceled };
    this.#globalError = 'Canceled';
    this.#status = 'rejected';
    this.#cancel && this.#cancel(() => (this.#isCanceled = true));
    this.#processNextTask();
  };

  #canceled = (callback) => {
    this.#cancel = callback;
    return () => {
      this.#isCanceled = true;
    };
  };

  get isCanceled() {
    return this.#isCanceled;
  }

  #processNextTask = () => {
    queueMicrotask(() => {
      if (this.#status === 'pending') return;

      this.#callbacks.forEach((callback) => {
        if (!callback) return;

        const { thenCallBack, catchCallBack, resolve, reject } = callback;

        try {
          if (this.#status === 'fulfilled') {
            const value = thenCallBack ? thenCallBack(this.#value) : this.#value;
            resolve(value);
          } else {
            if (catchCallBack) {
              const value = catchCallBack(this.#error);
              resolve(value);
            } else {
              reject(this.#error);
            }
          }
        } catch (error) {
          reject({
            error: error,
            isCanceled: this.#isCanceled,
          });
        }
      });

      this.#callbacks = [];
    });
  };
}

module.exports = CancelablePromise;

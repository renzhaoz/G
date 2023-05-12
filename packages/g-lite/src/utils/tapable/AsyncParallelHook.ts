export class AsyncParallelHook<T> {
  private callbacks: ((...args: T[]) => Promise<void>)[] = [];

  tapPromise(options: string, fn: (...args: T[]) => Promise<void>) {
    this.callbacks.push(fn);
  }

  promise(...args: T[]): Promise<void[]> {
    return Promise.all(
      this.callbacks.map((callback) => {
        return callback(...args);
      }),
    );
  }
}

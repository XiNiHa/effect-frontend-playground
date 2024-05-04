import { Context, Effect, Fiber, Option, Ref } from "effect";

class ReactiveScope extends Context.Tag("ReactiveScope")<
	ReactiveScope,
	{ getListener: () => Effect.Effect<void> }
>() {}

export function createSignal<T>(initialValue: T) {
	return Effect.gen(function* () {
		const ref = yield* Ref.make(initialValue);
		const listeners = new Set<Effect.Effect<void>>();

		return [
			Effect.gen(function* () {
				const scope = yield* Effect.serviceOption(ReactiveScope);
				Option.map(scope, (scope) => {
					const listener = scope.getListener();
					listeners.add(listener);
				});
				return yield* Ref.get(ref);
			}),
			(newValue: T) =>
				Effect.gen(function* () {
					yield* Ref.set(ref, newValue);
					const fibers = new Set<Fiber.RuntimeFiber<void, never>>();
					const prevListeners =  [...listeners];
					listeners.clear();
					for (const listener of prevListeners) {
						fibers.add(yield* Effect.fork(listener));
					}
					yield* Fiber.joinAll(fibers);
				}),
		] as const;
	});
}

export function createComputed<T>(effect: Effect.Effect<T>) {
	return Effect.gen(function* () {
		const ref = yield* Ref.make<T | undefined>(undefined);
		const listeners = new Set<Effect.Effect<void>>();

		const withScope: typeof effect = Effect.provideService(
			effect,
			ReactiveScope,
			{
				getListener: () => {
					return Effect.gen(function* () {
						const newValue = yield* withScope;
						const oldValue = yield* Ref.get(ref);
						if (Object.is(newValue, oldValue)) return;

						yield* Ref.set(ref, newValue);

						const fibers = new Set<Fiber.RuntimeFiber<void, never>>();
						const prevListeners =  [...listeners];
						listeners.clear();
						for (const listener of prevListeners) {
							fibers.add(yield* Effect.fork(listener));
						}
						yield* Fiber.joinAll(fibers);
					});
				},
			},
		);

		const initialValue = yield* withScope;
		yield* Ref.set(ref, initialValue);

		return Effect.gen(function* () {
			const scope = yield* Effect.serviceOption(ReactiveScope);
			Option.map(scope, (scope) => {
				const listener = scope.getListener();
				listeners.add(listener);
			});
			const value = yield* Ref.get(ref);
			return value as T;
		});
	});
}

export function createReaction(effect: Effect.Effect<void>) {
	return Effect.gen(function* () {
		const withScope: typeof effect = Effect.provideService(
			effect,
			ReactiveScope,
			{
				getListener: () =>
					Effect.gen(function* () {
						yield* Effect.async((resume) =>
							queueMicrotask(() => resume(Effect.succeed(undefined))),
						);
						yield* withScope;
					}),
			},
		);
		yield* withScope;
	});
}

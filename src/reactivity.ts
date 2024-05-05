import { Context, Effect, Option } from "effect";

type ParentCallbacks = {
	update?: Effect.Effect<void>;
	deregister: Effect.Effect<void>;
};

type ChildCallbacks = {
	markState: (state: NodeState) => Effect.Effect<void>;
};

type SourceHandles = {
	track: Effect.Effect<void>;
	markChildren: (state: NodeState) => Effect.Effect<void>;
};

type ListenerHandles = {
	updateIfNecessary: Effect.Effect<void>;
	register: (parent: ParentCallbacks) => Effect.Effect<ChildCallbacks>;
};

class ListenerScope extends Context.Tag("ListenerScope")<
	ListenerScope,
	{ register: (cbs: ParentCallbacks) => Effect.Effect<ChildCallbacks> }
>() {}

class EqualityFn extends Context.Tag("EqualityFn")<
	EqualityFn,
	(a: unknown, b: unknown) => boolean
>() {}

const getEqualityFn = Effect.gen(function* () {
	const option = yield* Effect.serviceOption(EqualityFn);
	return Option.getOrElse(
		option,
		() => (a: unknown, b: unknown) => Object.is(a, b),
	);
});

enum NodeState {
	Idle = 0,
	Vague = 1,
	Dirty = 2,
}

const reactiveSource = (props?: {
	update?: Effect.Effect<void>;
}): SourceHandles => {
	const children = new Set<ChildCallbacks>();

	return {
		track: Effect.gen(function* () {
			const scope = yield* Effect.serviceOption(ListenerScope);
			yield* Option.match(scope, {
				onSome: (scope) =>
					Effect.gen(function* () {
						const child = yield* scope.register({
							update: props?.update,
							deregister: Effect.sync(() => {
								children.delete(child);
							}),
						});
						children.add(child);
					}),
				onNone: () => Effect.succeed(undefined),
			});
		}),
		markChildren: (state: NodeState) =>
			Effect.gen(function* () {
				yield* Effect.all(
					[...children].map((c) => c.markState(state)),
					{ concurrency: Number.POSITIVE_INFINITY },
				);
			}),
	};
};

const reactiveListener = (props: {
	update: Effect.Effect<void>;
	onStateUpdate: (state: NodeState, previous: NodeState) => Effect.Effect<void>;
}): ListenerHandles => {
	let state = NodeState.Dirty;
	const parents = new Set<ParentCallbacks>();

	const clearParents = Effect.gen(function* () {
		yield* Effect.all(
			[...parents].map((p) => p.deregister),
			{ concurrency: Number.POSITIVE_INFINITY },
		);
		parents.clear();
	});

	return {
		updateIfNecessary: Effect.gen(function* () {
			if (state === NodeState.Vague) {
				for (const parent of parents) {
					if (parent.update) yield* parent.update;
					if ((state as NodeState) === NodeState.Dirty) {
						break;
					}
				}
			}

			if (state === NodeState.Dirty) {
				yield* clearParents;
				yield* props.update;
			}

			state = NodeState.Idle;
		}),
		register: (parent: ParentCallbacks) =>
			Effect.gen(function* () {
				parents.add(parent);

				return {
					markState: (newState: NodeState) =>
						Effect.gen(function* () {
							if (state > newState) return;
							const oldState = state;
							state = newState;
							yield* props.onStateUpdate(newState, oldState);
						}),
				};
			}),
	};
};

export function createSignal<T>(initialValue: T) {
	let value = initialValue;
	const source = reactiveSource();

	return [
		Effect.gen(function* () {
			yield* source.track;
			return value;
		}),
		(newValue: T) =>
			Effect.gen(function* () {
				const eq = yield* getEqualityFn;
				if (eq(newValue, value)) return;
				value = newValue;
				yield* source.markChildren(NodeState.Dirty);
			}),
	] as const;
}

export function createComputed<T>(effect: Effect.Effect<T>) {
	let value: T | undefined;

	const listener: ListenerHandles = reactiveListener({
		update: Effect.gen(function* () {
			const newValue = yield* computeWithScope;
			const eq = yield* getEqualityFn;
			if (!eq(newValue, value)) {
				value = newValue;
				yield* source.markChildren(NodeState.Dirty);
			}
		}),
		onStateUpdate: (state) =>
			source.markChildren(
				state === NodeState.Idle ? NodeState.Dirty : NodeState.Vague,
			),
	});
	const source = reactiveSource({
		update: listener.updateIfNecessary,
	});

	const computeWithScope = Effect.provideService(effect, ListenerScope, {
		register: listener.register,
	});

	return Effect.gen(function* () {
		yield* source.track;
		yield* listener.updateIfNecessary;
		return value as T;
	});
}

export function createReaction(effect: Effect.Effect<void>) {
	const listener: ListenerHandles = reactiveListener({
		update: Effect.gen(function* () {
			yield* Effect.async((resume) =>
				queueMicrotask(() => resume(Effect.succeed(undefined))),
			);
			yield* runWithScope;
		}),
		onStateUpdate: (state, previous) =>
			Effect.gen(function* () {
				if (previous === NodeState.Idle && state !== NodeState.Idle) {
					yield* listener.updateIfNecessary;
				}
			}),
	});
	const runWithScope: typeof effect = Effect.provideService(
		effect,
		ListenerScope,
		{ register: listener.register },
	);

	return listener.updateIfNecessary;
}

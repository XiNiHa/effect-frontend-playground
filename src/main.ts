import { Effect, Schedule, pipe } from "effect";
import "uno.css";
import { createComputed, createReaction, createSignal } from "./reactivity";

const program = Effect.gen(function* () {
	const [counter, setCounter] = yield* createSignal(0);
	const isEven = yield* createComputed(
		Effect.gen(function* () {
			console.log("isEven");
			const value = yield* counter;
			return value % 2 === 0;
		}),
	);
	const parity = yield* createComputed(
		Effect.gen(function* () {
			console.log("parity");
			const value = yield* isEven;
			return value ? "even" : "odd";
		}),
	);

	yield* createReaction(
		Effect.gen(function* () {
			console.log("reaction", yield* parity);
		}),
	);

	yield* pipe(
		Effect.gen(function* () {
			const value = yield* counter;
			const newValue = value + (Math.random() > 0.5 ? 1 : 2);
			console.log("newValue", newValue);
			yield* setCounter(newValue);
		}),
		Effect.schedule(
			Schedule.addDelay(Schedule.repeatForever, () => "2 seconds"),
		),
	);
});

Effect.runPromiseExit(program)
	.then((exit) => {
		console.log("exit", exit);
	})

import { Console, Effect, Schedule, pipe } from "effect";
import "uno.css";
import { createComputed, createReaction, createSignal } from "./reactivity";

const program = Effect.gen(function* () {
	const [counter, setCounter] = createSignal(0);
	const isEven = createComputed(
		Effect.gen(function* () {
			yield* Console.log("isEven");
			const value = yield* counter;
			return value % 2 === 0;
		}),
	);
	const parity = createComputed(
		Effect.gen(function* () {
			yield* Console.log("parity");
			const value = yield* isEven;
			return value ? "even" : "odd";
		}),
	);
	const divisibleBy5 = createComputed(
		Effect.gen(function* () {
			yield* Console.log("divisibleBy5");
			const value = yield* counter;
			return value % 5 === 0;
		}),
	);

	yield* createReaction(
		Effect.gen(function* () {
			yield* Console.log("reaction");
			yield* Console.log("parity:", yield* parity);
			yield* Console.log("divisibleBy5:", yield* divisibleBy5);
		}),
	);

	yield* pipe(
		Effect.gen(function* () {
			const value = yield* counter;
			const newValue = value + (Math.random() > 0.5 ? 1 : 2);
			yield* Console.log("newValue", newValue);
			yield* setCounter(newValue);
		}),
		Effect.schedule(
			Schedule.addDelay(Schedule.repeatForever, () => "2 seconds"),
		),
	);
});

Effect.runPromiseExit(program).then((exit) => {
	console.log("exit", exit);
});

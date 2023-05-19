import { randomInt } from "crypto";

// a neural net
export default class NeuralNet {
    forward(input: number[]): number {
        // TODO: given an array of inputs, return an output
        return randomInt(10000) / 10000
    }

    backward(data: TrainData) {
        // TODO: given input and output data, run a round of backpropogation
    }
}

export type TrainData = {
    input: number[],
    output: number
}
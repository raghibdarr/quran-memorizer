declare module '@huggingface/transformers' {
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<(input: unknown, options?: Record<string, unknown>) => Promise<{ text: string } | string>>;

  export const env: {
    backends: {
      onnx: {
        wasm: {
          numThreads: number;
        };
      };
    };
  };
}

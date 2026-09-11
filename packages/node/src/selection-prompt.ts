import { emitKeypressEvents, type Key } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { SelectionPrompt } from '@jvm-expert/core';

export type PromptInput = Readable & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  ref?(): unknown;
  unref?(): unknown;
};
export type PromptOutput = Writable & { isTTY?: boolean; columns?: number };

/** A small terminal menu: arrows, digits, Enter, and Escape; no shell or agent process. */
export class NodeSelectionPrompt implements SelectionPrompt {
  private readonly input: PromptInput;
  private readonly output: PromptOutput;

  constructor(input: PromptInput = process.stdin, output: PromptOutput = process.stderr) {
    this.input = input;
    this.output = output;
  }

  async choose(message: string, choices: readonly string[]): Promise<number | undefined> {
    if (!this.input.isTTY || !this.output.isTTY || choices.length === 0) return undefined;
    const input = this.input;
    const output = this.output;
    const wasRaw = input.isRaw === true;
    const wasFlowing = input.readableFlowing === true;
    let selected = 0;
    output.write(`\n${message}\n\n`);
    // Keep each redrawn menu row on one physical line, including on narrow terminals.
    const fit = (text: string) => {
      const width = Math.max(10, (output.columns || 80) - 1);
      return text.length <= width ? text : `${text.slice(0, width - 3)}...`;
    };
    const draw = () => {
      choices.forEach((choice, index) =>
        output.write(
          `\x1b[2K\r${fit(`${index === selected ? '>' : ' '} ${index + 1}. ${choice}`)}\n`,
        ),
      );
      output.write(`\x1b[2K\r${fit('Use arrows or a number, Enter to select, Esc to continue.')}`);
    };
    emitKeypressEvents(input);
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value?: number) => {
        if (finished) return;
        finished = true;
        input.off('keypress', onKey);
        input.off('end', onEnd);
        input.off('close', onEnd);
        input.off('error', onEnd);
        input.setRawMode(wasRaw);
        if (!wasFlowing) {
          input.pause();
          input.unref?.();
        }
        output.write('\n');
        resolve(value);
      };
      const onEnd = () => finish();
      const onKey = (_text: string, key: Key) => {
        if (key.name === 'escape' || (key.ctrl && ['c', 'd'].includes(key.name ?? '')))
          return finish();
        if (key.name === 'return' || key.name === 'enter') return finish(selected);
        if (key.name === 'up') selected = (selected + choices.length - 1) % choices.length;
        else if (key.name === 'down' || key.name === 'tab')
          selected = (selected + 1) % choices.length;
        else if (/^[1-9]$/.test(key.sequence ?? '') && Number(key.sequence) <= choices.length)
          selected = Number(key.sequence) - 1;
        else return;
        output.write(`\r\x1b[${choices.length}A`);
        draw();
      };
      input.on('keypress', onKey);
      input.once('end', onEnd);
      input.once('close', onEnd);
      input.once('error', onEnd);
      input.setRawMode(true);
      input.ref?.();
      input.resume();
      draw();
    });
  }
}

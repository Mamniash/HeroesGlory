import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PIXEL_SCALE_MIN,
  PIXEL_SCALE_MAX,
  computeContinuousScale,
} from '../module/helpers/pixel-scale.mjs';

describe('computeContinuousScale — the shared continuous --hg-pixel-scale ratio', () => {
  test('1 at the reference width', () => {
    assert.equal(computeContinuousScale(758, 758), 1);
  });

  test('scales linearly with width', () => {
    assert.equal(computeContinuousScale(1516, 758), 2);
    assert.equal(computeContinuousScale(568.5, 758), 0.75); // above PIXEL_SCALE_MIN, so unclamped
  });

  test('clamps at PIXEL_SCALE_MIN on a very narrow canvas', () => {
    assert.equal(computeContinuousScale(1, 758), PIXEL_SCALE_MIN);
  });

  test('clamps at PIXEL_SCALE_MAX on a very wide canvas', () => {
    assert.equal(computeContinuousScale(100000, 758), PIXEL_SCALE_MAX);
  });
});

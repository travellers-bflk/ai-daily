/**
 * sources.ts 单元测试。
 *
 * 锁定第三轮审查 P1-3（「N 个来源」被转载注记抬高）与 P1-5（多来源只有末尾
 * 日期进徽章）所依赖的分段/剥离/去重语义。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitSourceParts,
  mediaName,
  distinctMediaCount,
} from '../src/lib/sources.ts';

describe('splitSourceParts', () => {
  test('单来源带日期', () => {
    assert.deepEqual(splitSourceParts('[路透社](https://r.com)（9 月 5 日）'), [
      { text: '[路透社](https://r.com)', date: '9 月 5 日' },
    ]);
  });

  test('多来源各自带日期', () => {
    assert.deepEqual(
      splitSourceParts('[甲](https://a.com)（9 月 8 日）、[乙](https://b.com)（9 月 9 日）'),
      [
        { text: '[甲](https://a.com)', date: '9 月 8 日' },
        { text: '[乙](https://b.com)', date: '9 月 9 日' },
      ]
    );
  });

  test('半角括号同样识别', () => {
    assert.deepEqual(splitSourceParts('路透社(9 月 5 日)'), [
      { text: '路透社', date: '9 月 5 日' },
    ]);
  });

  test('注记内的顿号不是分段点', () => {
    const parts = splitSourceParts(
      '[腾讯新闻（转载：工信部、新华社报道）](https://a.com)（9 月 5 日）、[乙](https://b.com)'
    );
    assert.equal(parts.length, 2);
    assert.match(parts[0].text, /工信部、新华社/);
  });

  test('URL 含一层平衡括号时日期剥离不受影响', () => {
    assert.deepEqual(
      splitSourceParts('[维基百科](https://zh.wikipedia.org/wiki/人工智能_(消歧义))（9 月 5 日）'),
      [
        {
          text: '[维基百科](https://zh.wikipedia.org/wiki/人工智能_(消歧义))',
          date: '9 月 5 日',
        },
      ]
    );
  });

  test('末尾不是日期括号时原样保留', () => {
    assert.deepEqual(splitSourceParts('[甲](https://a.com/xx)'), [
      { text: '[甲](https://a.com/xx)', date: '' },
    ]);
  });

  test('空串返回空数组', () => {
    assert.deepEqual(splitSourceParts(''), []);
  });
});

describe('mediaName', () => {
  test('取链接文字', () => {
    assert.equal(mediaName({ text: '[路透社](https://r.com)', date: '' }), '路透社');
  });

  test('无链接时取原文', () => {
    assert.equal(mediaName({ text: '路透社', date: '' }), '路透社');
  });

  test('剥离转载注记（P1-3 的去重键）', () => {
    assert.equal(
      mediaName({ text: '[今日头条（转载：界面新闻报道）](https://t.com)', date: '' }),
      '今日头条'
    );
  });
});

describe('distinctMediaCount', () => {
  test('同一家媒体带不同注记只算一次', () => {
    const parts = splitSourceParts(
      '[今日头条](https://t.com/1)（9 月 8 日）、[今日头条（转载：界面新闻报道）](https://t.com/2)（9 月 9 日）'
    );
    assert.equal(distinctMediaCount(parts), 1);
  });

  test('不同媒体分别计数', () => {
    const parts = splitSourceParts('[甲](https://a.com)、[乙](https://b.com)、甲');
    assert.equal(distinctMediaCount(parts), 2);
  });
});

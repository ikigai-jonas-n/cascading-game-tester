/** @type {import('../game-registry.js').GameConfig} */
export default {
  id: 'eldorado',
  gameCode: 'eldorado',
  isEnabled: false,
  hooks: {},
    grid: { rows: 3, cols: 5 },
    paytable: [
          [
            0,
            0,
            0,
            1000
          ],
          [
            0,
            0,
            0,
            500
          ],
          [
            0,
            0,
            0,
            300
          ],
          [
            0,
            0,
            0,
            160
          ],
          [
            0,
            0,
            0,
            100
          ],
          [
            0,
            0,
            0,
            60
          ],
          [
            0,
            0,
            0,
            40
          ],
          [
            0,
            0,
            0,
            20
          ],
          [
            0,
            0,
            0,
            20
          ],
          [
            0,
            0,
            0,
            0
          ],
          [
            0,
            0,
            0,
            0
          ]
        ],
    winCap: 118300,
    betBase: 100,
    wildSymbolId: 0,
    symbols: {
          0: { name: 'WILD', emoji: '', color: '#666' },
          1: { name: 'HIGH', emoji: '', color: '#666' },
          2: { name: 'HIGH', emoji: '', color: '#666' },
          3: { name: 'HIGH', emoji: '', color: '#666' },
          4: { name: 'HIGH', emoji: '', color: '#666' },
          5: { name: 'LOW', emoji: '', color: '#666' },
          6: { name: 'LOW', emoji: '', color: '#666' },
          7: { name: 'LOW', emoji: '', color: '#666' },
          8: { name: 'LOW', emoji: '', color: '#666' },
          9: { name: 'MULTIPLIER', emoji: '', color: '#666' },
          10: { name: 'SPECIAL', emoji: '', color: '#666' }
        }
};

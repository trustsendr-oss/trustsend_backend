import { test } from '@japa/runner'
import { CurrencyLogoService } from '#services/money/currency_logo_service'

test.group('CurrencyLogoService', () => {
  test('uses the issuing country flag when one exists', ({ assert }) => {
    const logo = CurrencyLogoService.render('CDF', 'CD', 'FC')

    assert.equal(logo.kind, 'flag')
    assert.include(logo.svg, '<svg')
  })

  test('falls back to a badge for currencies shared by several countries', ({ assert }) => {
    const logo = CurrencyLogoService.render('XAF', null, 'FCFA')

    assert.equal(logo.kind, 'badge')
    assert.include(logo.svg, '>FCFA</text>')
  })

  test('ignores unknown or malformed country codes', ({ assert }) => {
    assert.isNull(CurrencyLogoService.flagSvg('ZZ'))
    assert.isNull(CurrencyLogoService.flagSvg('../../etc/passwd'))
    assert.isNull(CurrencyLogoService.flagSvg(null))
  })

  test('shows the code when the symbol is missing, too long or a bare dollar sign', ({ assert }) => {
    assert.equal(CurrencyLogoService.badgeLabel('XCD', '$'), 'XCD')
    assert.equal(CurrencyLogoService.badgeLabel('XPF', null), 'XPF')
    assert.equal(CurrencyLogoService.badgeLabel('ABC', 'VeryLong'), 'ABC')
    assert.equal(CurrencyLogoService.badgeLabel('XOF', 'CFA'), 'CFA')
  })

  test('escapes the badge text', ({ assert }) => {
    const svg = CurrencyLogoService.badgeSvg('ABC', '<&>')

    assert.include(svg, '&lt;&amp;&gt;')
    assert.notInclude(svg, '<&>')
  })
})

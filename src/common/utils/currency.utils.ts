/**
 * Currency utility class for formatting and manipulating monetary values
 * with special support for Indian numbering system and currency symbols.
 */
export class CurrencyUtils {
  private static currencySymbols: { [key: string]: string } = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'CHF',
    CNY: '¥',
    KRW: '₩',
  };

  private static currencyNames: { [key: string]: string } = {
    INR: 'Indian Rupees',
    USD: 'US Dollars',
    EUR: 'Euros',
    GBP: 'British Pounds',
    JPY: 'Japanese Yen',
    CAD: 'Canadian Dollars',
    AUD: 'Australian Dollars',
    CHF: 'Swiss Francs',
    CNY: 'Chinese Yuan',
    KRW: 'South Korean Won',
  };

  /**
   * Formats a number as Indian currency with proper symbol, commas, and suffix.
   */
  static formatINR(
    amount: number,
    currency: string = 'INR',
    showDecimals: boolean = false,
  ): string {
    if (!this.isValidAmount(amount)) {
      return 'Invalid amount';
    }

    const symbol = this.currencySymbols[currency] || currency;
    const formattedAmount = this.formatIndianNumber(amount, showDecimals);

    return `${amount < 0 ? '-' : ''}${symbol} ${formattedAmount}/-`;
  }

  /**
   * Formats amount for any currency with international standards.
   */
  static formatCurrency(
    amount: number,
    currency: string = 'INR',
    locale: string = 'en-IN',
    showDecimals: boolean = true,
  ): string {
    if (!this.isValidAmount(amount)) {
      return 'Invalid amount';
    }

    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    };

    try {
      return new Intl.NumberFormat(locale, options).format(amount);
    } catch (error) {
      // Fallback formatting
      const symbol = this.currencySymbols[currency] || currency;
      const formattedAmount = this.formatInternationalNumber(
        amount,
        showDecimals,
      );
      return `${symbol}${formattedAmount}`;
    }
  }

  /**
   * Converts number to words (Indian numbering system).
   */
  static toWords(amount: number, currency: string = 'INR'): string {
    if (!this.isValidAmount(amount)) {
      return 'Invalid amount';
    }

    const currencyName = this.currencyNames[currency] || currency;
    const wholePart = Math.floor(Math.abs(amount));
    const decimalPart = Math.round((Math.abs(amount) - wholePart) * 100);

    const wholeWords = this.convertNumberToWords(wholePart);
    const decimalWords =
      decimalPart > 0 ? this.convertNumberToWords(decimalPart) : null;

    const sign = amount < 0 ? 'Negative ' : '';

    if (decimalWords) {
      const subunit = currency === 'INR' ? 'Paise' : 'Cents';
      return `${sign}${wholeWords} ${currencyName} And ${decimalWords} ${subunit} Only`.trim();
    }

    return `${sign}${wholeWords} ${currencyName} Only`.trim();
  }

  /**
   * Parses a currency string back to number.
   *
   * @param currencyString - The formatted currency string
   * @returns Parsed numerical value or NaN if invalid
   *
   * @example
   * CurrencyUtils.parseCurrency('₹ 5,000/-') // 5000
   * CurrencyUtils.parseCurrency('$1,250.75') // 1250.75
   * CurrencyUtils.parseCurrency('€1.234,56') // 1234.56 (European format)
   * CurrencyUtils.parseCurrency('Invalid') // NaN
   */
  static parseCurrency(currencyString: string): number {
    if (!currencyString || typeof currencyString !== 'string') {
      return NaN;
    }

    // Remove currency symbols, spaces, and special characters except decimal points and commas
    let cleaned = currencyString
      .replace(/[^\d.,-]/g, '') // Keep digits, dots, commas, and minus
      .replace(/\/-$/, '') // Remove Indian /- suffix
      .trim();

    if (!cleaned) return NaN;

    // Handle European decimal format (1.234,56 -> 1234.56)
    // European format uses dots as thousands separators and comma as decimal
    const isEuropeanFormat = /^-?\d{1,3}(?:\.\d{3})*,\d+$/.test(cleaned);

    if (isEuropeanFormat) {
      // Remove dots (thousands separators) and replace comma with dot (decimal)
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }

    // Handle International/Indian format (1,234.56 or 1,00,000.50 -> 1234.56 or 100000.50)
    // Remove all commas (thousands separators)
    cleaned = cleaned.replace(/,/g, '');

    return parseFloat(cleaned);
  }

  /**
   * Validates if a string is a valid currency amount.
   */
  static isValidCurrency(value: string): boolean {
    if (!value || typeof value !== 'string') return false;

    // More flexible regex that handles Indian and international formats
    const currencyRegex =
      /^-?(\d+|\d{1,3}(,\d{3})*|\d{1,2}(,\d{2})*(,\d{3})*)(\.\d+)?\/?\-?$/;
    const cleaned = value.replace(/[^\d.,-]/g, '');

    return currencyRegex.test(cleaned) && !isNaN(this.parseCurrency(value));
  }

  // Private helper methods

  private static isValidAmount(amount: number): boolean {
    return typeof amount === 'number' && !isNaN(amount) && isFinite(amount);
  }

  private static formatIndianNumber(
    amount: number,
    showDecimals: boolean,
  ): string {
    const absoluteAmount = Math.abs(amount);
    const numberString = absoluteAmount.toFixed(showDecimals ? 2 : 0);

    // Handle Indian numbering system manually for better control
    const [whole, decimal] = numberString.split('.');

    let lastThree = whole.slice(-3);
    const otherNumbers = whole.slice(0, -3);

    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }

    let formatted =
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

    if (showDecimals && decimal) {
      formatted += '.' + decimal;
    }

    return formatted;
  }

  private static formatInternationalNumber(
    amount: number,
    showDecimals: boolean,
  ): string {
    const absoluteAmount = Math.abs(amount);
    return absoluteAmount.toLocaleString('en-IN', {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    });
  }

  private static convertNumberToWords(num: number): string {
    if (num === 0) return 'Zero';

    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
    ];
    const teens = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    // Indian numbering system units
    const units = ['', 'Thousand', 'Lakh', 'Crore'];

    if (num < 1000) {
      // Handle numbers below 1000
      if (num < 10) return ones[num];
      if (num < 20) return teens[num - 10];
      if (num < 100) {
        return (
          tens[Math.floor(num / 10)] +
          (num % 10 !== 0 ? ' ' + ones[num % 10] : '')
        );
      }
      return (
        ones[Math.floor(num / 100)] +
        ' Hundred' +
        (num % 100 !== 0 ? ' ' + this.convertNumberToWords(num % 100) : '')
      );
    }

    // Handle larger numbers in Indian system
    let result = '';
    let unitIndex = 0;

    while (num > 0) {
      const chunk = num % 1000;
      if (chunk !== 0) {
        let chunkWords = this.convertNumberToWords(chunk);
        if (unitIndex > 0) {
          chunkWords += ' ' + units[unitIndex];
        }
        result = chunkWords + (result ? ' ' + result : '');
      }
      num = Math.floor(num / 1000);
      unitIndex++;
    }

    return result.trim();
  }
}

// Convenience functions for common use cases
export const formatINR = (
  amount: number,
  showDecimals: boolean = false,
): string => CurrencyUtils.formatINR(amount, 'INR', showDecimals);

export const formatCurrency = (
  amount: number,
  currency: string = 'INR',
): string => CurrencyUtils.formatCurrency(amount, currency);

export const amountToWords = (
  amount: number,
  currency: string = 'INR',
): string => CurrencyUtils.toWords(amount, currency);

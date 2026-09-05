import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the correct title', async ({ page }) => {
    // Check that the page title is correct
    await expect(page).toHaveTitle('Tailspin Toys - Crowdfunding your new favorite game!');
  });

  test('should display the main heading', async ({ page }) => {
    // Check that the main page heading is present
    await expect(page.getByRole('heading', { name: 'Welcome to Tailspin Toys', exact: true })).toBeVisible();
  });

  test('should display the site branding in header', async ({ page }) => {
    // Check that the site branding is present in the header (no longer an h1)
    await expect(page.getByText('Tailspin Toys').first()).toBeVisible();
  });

  test('should display the welcome message', async ({ page }) => {
    // Check that the welcome message is present using more specific locator
    await expect(page.getByText('Find your next game! And maybe even back one! Explore our collection!')).toBeVisible();
  });

  test('should filter the catalog by category and publisher and preserve selections after applying', async ({ page }) => {
    await expect(page.getByTestId('game-filters-form')).toBeVisible();

    const categoryInput = page.locator('input[name="category"]').first();
    await expect(categoryInput).toBeVisible();
    const categoryValue = await categoryInput.getAttribute('value');
    await categoryInput.check();

    const publisherFilter = page.getByTestId('publisher-filter');
    await expect(publisherFilter).toBeVisible();
    await publisherFilter.selectOption({ index: 1 });
    const publisherValue = await publisherFilter.inputValue();

    await page.getByTestId('apply-filters-button').click();

    await expect(page).toHaveURL(/\?.*category=/);
    await expect(page).toHaveURL(/\?.*publisher=/);
    await expect(page.locator(`input[name="category"][value="${categoryValue}"]`)).toBeChecked();
    await expect(publisherFilter).toHaveValue(publisherValue);

    const visibleCards = await page.locator('[data-testid="game-card"]').evaluateAll((items) =>
      items.filter((item) => item instanceof HTMLElement && !item.hidden).length,
    );
    const totalCards = await page.locator('[data-testid="game-card"]').count();
    expect(visibleCards).toBeGreaterThan(0);
    expect(visibleCards).toBeLessThan(totalCards);
  });
});

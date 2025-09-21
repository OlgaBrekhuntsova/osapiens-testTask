import { test, expect, Locator, Page } from '@playwright/test';

// Assumptions:
// - browsers are set in config file, so I don't mention them in test.use()
// - devices are set in config file, so I don't mention them in test.use()
// - headless is set in config file

const LanguageMap = {
    english: "en-GB",
    deutsch: "de",
} as const;

type Language = keyof typeof LanguageMap;
const mainPath = 'https://careers.osapiens.com/'

class JobsPage {
    readonly page: Page;
    readonly keyElement: Locator;
    readonly footer: Locator;
    readonly jobsTable: Locator;
    readonly jobsTableHeader;
    readonly jobsTableBody: Locator;
    readonly jobsTableJobRow: Locator;
    readonly COLUMNS_NAMES = ['Job Title', 'Location', 'Team']//needed because mobile version doesn't have testId


    constructor(page: Page) {
        this.page = page;
        this.keyElement = page.locator('h2.careers-hero-block__title')
        this.jobsTable = page.getByRole('grid') //as currently there is just 1 grid (table) element on the page, we don't need more precise specification
        // if there are a few tables at the website with the same structure (grid -->.rt-thead&&.rt-tbody --> row --> gridcell), it makes sense to create class Table with all table methods.
        this.jobsTableHeader = this.jobsTable.locator('.rt-thead')
        this.jobsTableBody = this.jobsTable.locator('.rt-tbody')
        this.jobsTableJobRow = this.jobsTableBody.getByRole('row')
        this.footer = page.locator('footer')
    }

    private async getMode(): Promise<'desktop' | 'mobile'> {
        const viewport = this.page.viewportSize()
        if (!viewport) return 'desktop'
        return viewport.width > 768 ? 'desktop' : 'mobile'
    }

    async goto(): Promise<void> {
        await this.page.goto(mainPath)
    }

    async isLoaded(): Promise<boolean> {
        return await this.keyElement.isVisible()
    }

    async isLanguageActive(language: Language): Promise<boolean> {
        try {
            expect(await this.page.locator('html').getAttribute('lang')).toBe(LanguageMap[language])
            return true
        } catch (error) {
            if (error instanceof Error) { console.log(error.message) }
            return false
        }
    }

    async setLanguage(language: Language): Promise<void> {
        await this.footer.getByRole("link", { name: language.toUpperCase() }).click()
        await this.page.pause()
        expect(await this.page.locator('html').getAttribute('lang')).toBe(language)
    }

    //if there was paginator or lazy load, function should be refactored
    async getAllJobsTableRows(): Promise<Locator[]> {
        //function returns reversed array, comparing to displayed. As it's not important for current test, I wasn't investigating is it expected by properties or not
        return await this.jobsTableJobRow.all()
    }

    async getJobTableHeaderColumnNumber(headerName: string, viewport?: 'mobile' | 'desktop'): Promise<number> {
        if (!viewport) { if (await this.getMode() === 'mobile') { throw new Error("Mobile mode doesn't have table header.") } }
        const headerColumns = await this.jobsTableHeader.getByRole('columnheader').all()
        for (const headerColumn of headerColumns) {
            if ((await headerColumn.textContent()) === headerName) {
                return headerColumns.indexOf(headerColumn) + 1
            }
        }
        throw new Error(`Header column with name ${headerName} isn't found.`)
    }

    async getJobCellByColumn(jobRow: Locator, columnName: string, viewport?: 'mobile' | 'desktop'): Promise<Locator> {
        if (!viewport) { if (await this.getMode() === 'mobile') { throw new Error("Mobile mode doesn't have columns.") } }
        const rowCells = await jobRow.getByRole('gridcell').all()
        return rowCells[(await this.getJobTableHeaderColumnNumber(columnName, viewport)) - 1]
    }

    async getJobRowByNameSubstring(searchString: string, headerName: string, isCaseSensitive: boolean = true): Promise<Locator[]> {
        const jobsRowsArray = []
        const jobsList = await this.getAllJobsTableRows()
        let jobRowName = ''
        if (await this.getMode() === 'mobile') {
            for (const jobRow of jobsList) {
                //testId for mobile name element selector is needed
                jobRowName = await (await jobRow.locator('.mar-b-1').all())[this.COLUMNS_NAMES.indexOf(headerName)].innerText()
                if (isCaseSensitive ? jobRowName?.includes(searchString) : jobRowName?.toLowerCase()?.includes(searchString.toLowerCase())) {
                    jobsRowsArray.push(jobRow)
                }
            }
        } else {
            for (const jobRow of jobsList) {
                jobRowName = await (await this.getJobCellByColumn(jobRow, headerName, 'desktop')).innerText()
                if (isCaseSensitive ? jobRowName?.includes(searchString) : jobRowName?.toLowerCase()?.includes(searchString.toLowerCase())) {
                    jobsRowsArray.push(jobRow)
                }
            }
        }
        return jobsRowsArray
    }
}

test.beforeEach(async ({ page }) => {
    const jobsPage = new JobsPage(page)
    await jobsPage.goto()
});

test.describe(`Jobs Page is displayed as expected`, () => {

    const parameters = [
        { testId: '@id-00001', language: 'English', columnName: 'Job Title', searchString: 'Quality', caseSensitiveSearch: true },
        //ADDITIONAL SCENARIOS (as example):
        //POSSIBLE BUG: currently looks like German version page works not correctly and document's language doesn't switch to lang="de"
        // { testId: '@id-00002', language: 'Deutsch', columnName: 'Job Title', searchString: 'Quality', caseSensitiveSearch: true },
        // { testId: '@id-00003', language: 'English', columnName: 'Team', searchString: 'Assurance', caseSensitiveSearch: false },
    ];

    for (const { testId, language, columnName, searchString, caseSensitiveSearch } of parameters) {
        test(`${testId} ${language} version Jobs Page contains ${columnName} with text "${searchString}"`, async ({ page }) => {
            const jobsPage = new JobsPage(page)
            await test.step(`page is active`, async () => {
                if (!await jobsPage.isLoaded()) { throw new Error('Jobs Page is not active.') }
            });
            await test.step(`set ${language} language`, async () => {
                if (!await jobsPage.isLanguageActive(language.toLowerCase() as Language)) {
                    await jobsPage.setLanguage(language.toLowerCase() as Language)
                }
            });
            await test.step(`the jobs table is displayed`, async () => {
                if (!await jobsPage.jobsTable.isVisible()) { throw new Error('Jobs table is not displayed.') }
            });
            await test.step(`print the number of opened jobs`, async () => {
                console.log(`Totally ${(await jobsPage.getAllJobsTableRows()).length} jobs are found.`)

            });
            await test.step(`at least 1 ${columnName} contains ${searchString} (case sensitive check = ${caseSensitiveSearch})`, async () => {
                const filteredJobsArray = await jobsPage.getJobRowByNameSubstring(searchString, columnName, caseSensitiveSearch)
                expect(!!(filteredJobsArray.length)).toBe(true)
                console.log(`${filteredJobsArray.length} jobs with "${searchString}" in ${columnName} are found:\n${await locatorsArrayContentToString(filteredJobsArray)} `)
            });
        });
    }
});

async function locatorsArrayContentToString(locatorsArray: Locator[]): Promise<string> {
    const locatorsContentArray = []
    let counter = 1
    for (const locator of locatorsArray) {
        locatorsContentArray.push(counter + ". " + (await locator.innerText()).split('\n').join(' | '))
        counter++
    }
    return locatorsContentArray.join('\n')
}
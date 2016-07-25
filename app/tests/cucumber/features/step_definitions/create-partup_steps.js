module.exports = function () {

  this.Given(/^I am loggedin and I navigate to \"\/start\/details\"$/, function () {
    browser.cookie('post', {name: 'cb-enabled', value: 'enabled'});
    browser.url(process.env.ROOT_URL + '/login');
    browser.element('[name="email"], [name="password"]').waitForExist();
    browser.setValue('[name="email"]', 'user@example.com');
    browser.setValue('[name="password"]', 'user');
    browser.click('[type=submit]');

    browser.waitForExist('.pu-sub-nav', 1000);

    browser.url(process.env.ROOT_URL + '/start/details');
    browser.waitForExist('#createPartupForm');
  });


  this.When(/^I enter the partup details$/, function () {

    browser.setValue('[name="partup_name"]', 'Organise Testing Party')
      .setValue('textarea', 'a nice testing party description')
      .setValue('.bootstrap-tagsinput input', 'testing');
    browser.element('body').keys('\uE004');
    browser.element('body').keys('\uE00D');
    browser.element('.day:not(.disabled):last-child').click();
    browser.element('body').keys('\uE004');
    browser.setValue('.pu-input.typeahead.tt-input', 'Den Ha');
    browser.waitForVisible('.tt-menu');
    browser.element('.tt-selectable').click();
    browser.element('body').keys('\uE004');
    browser.element('body').keys('\uE004');
    browser.element('body').keys('\uE004');
    browser.element('body').keys('\uE00D');

    browser.element('body').keys('\uE004');
    browser.element('body').keys('\uE004');
    browser.element('body').keys('\uE00D');

    browser.waitForVisible('.lfy-focuspoint-button', 10000);
    browser.element('.pu-button.pu-button-arrow').click();

    // browser.waitForExist('.pu-activity-form', 1000);
    //
    // browser.element('.pu-button.pu-button-arrow').click();
    //
    // browser.waitForExist('.pu-composition-startpartup-promote');
    //
    // browser.element('.pu-button.pu-button-arrow').click();

  });

  this.Then(/^I should be on the start activities screen$/, function () {
    // expect(browser.getText('.pu-partupheader h1')).toBe('Organise Testing Party');
    expect(browser.element('.pu-activity-form')).toBeDefined();
  });
};


Template.modal_invite_to_partup.onCreated(function() {
    var template = this;
    var partupId = template.data.partupId;
    template.userIds = new ReactiveVar([]);
    template.loading = new ReactiveVar(true);

    var resetPage = function() {
        _.defer(function() {
            template.page.set('reset');
            _.defer(function() { template.page.set(0); });
        });
    };

    template.activeTab = new ReactiveVar(0, function(prev, curr) {
        if (prev !== curr) {
            template.userIds.set([]);
            template.states.paging_end_reached.set(false);
            template.states.loading_infinite_scroll = false;
            template.searchQuery.set('');
            resetPage();
        }
    });
    var currentQuery = '';

    template.states = {
        loading_infinite_scroll: false,
        paging_end_reached: new ReactiveVar(false)
    };
    var PAGING_INCREMENT = 10;
    template.searchQuery = new ReactiveVar(undefined, function(prevQuery, query) {
        currentQuery = query;
        if (prevQuery !== query) {
            template.userIds.set([]);
            template.states.paging_end_reached.set(false);
            template.states.loading_infinite_scroll = false;
            resetPage();
        }
    });

    template.subscribe('partups.one', template.data.partupId, function() {
        var partup = Partups.findOne(template.data.partupId);
        var networks = template.networks.get();
        var network = lodash.find(networks, {_id: partup.network_id || undefined});
        template.selectedNetwork.set(network ? network.slug : 'all');
    });

    template.networks = new ReactiveVar([]);
    var user = Meteor.user();
    var query = {
        token: Accounts._storedLoginToken(),
        archived: false
    };

    HTTP.get('/users/' + user._id + '/networks' + mout.queryString.encode(query), function(error, response) {
        if (error || !response.data.networks || response.data.networks.length === 0) return;

        var result = response.data;

        template.networks.set(result.networks.map(function(network) {
            Partup.client.embed.network(network, result['cfs.images.filerecord'], result.users);

            return network;
        }).sort(Partup.client.sort.alphabeticallyASC.bind(null, 'name')));
    });

    // Submit filter form
    template.submitFilterForm = function() {
        Meteor.defer(function() {
            var form = template.find('form#suggestionsQuery');
            $(form).submit();
        });
    };

    template.selectedNetwork = new ReactiveVar('all', function(prev, curr) {
        if (prev !== curr) {
            template.userIds.set([]);
            template.states.paging_end_reached.set(false);
            template.states.loading_infinite_scroll = false;
            resetPage();
        }
    });

    template.callIteration = 0;

    template.page = new ReactiveVar(false, function(previousPage, page) {
        if (page === 'reset') return;
        var query = template.searchQuery.get() || '';
        var options = {
            query: query,
            limit: PAGING_INCREMENT,
            skip: page * PAGING_INCREMENT,
            network: template.selectedNetwork.get(),
            invited_in_partup: template.activeTab.curValue === 2 ? partupId : undefined
        };
        template.loading.set(true);
        // this meteor call still needs to be created
        template.callIteration++;
        var currentCallIteration = template.callIteration;
        Meteor.call('partups.user_suggestions', partupId, options, function(error, userIds) {
            if (query !== currentQuery) return;
            if (currentCallIteration !== template.callIteration) return;
            template.loading.set(false);
            if (error) {
                return Partup.client.notify.error(TAPi18n.__('base-errors-' + error.reason));
            }
            if (!userIds || userIds.length === 0) {
                template.states.loading_infinite_scroll = false;
                template.states.paging_end_reached.set(true);
                return;
            }

            template.states.paging_end_reached.set(userIds.length < PAGING_INCREMENT);

            var existingUserIds = template.userIds.get();
            var newUserIds = existingUserIds.concat(userIds);
            template.userIds.set(newUserIds);

            template.states.loading_infinite_scroll = false;
        });
    });
    template.page.set(0);
});

Template.modal_invite_to_partup.onRendered(function() {
    var template = this;
    Partup.client.scroll.infinite({
        template: template,
        element: template.find('[data-infinitescroll-container]'),
        offset: 800
    }, function() {
        if (template.states.loading_infinite_scroll || template.states.paging_end_reached.curValue) { return; }
        template.page.set(template.page.get() + 1);
    });
});

Template.modal_invite_to_partup.helpers({
    data: function() {
        var template = Template.instance();
        return {
            suggestionIds: function() {
                return template.userIds.get();
            },
            textsearch: function() {
                return template.searchQuery.get() || '';
            },
            partupId: function() {
                return template.data.partupId;
            },
            userTribes: function() {
                return template.networks.get();
            },
            partup: function() {
                return Partups.findOne(template.data.partupId);
            }
        };
    },
    state: function() {
        var template = Template.instance();
        return {
            loading: function() {
                return template.loading.get();
            },
            activeTab: function() {
                return template.activeTab.get();
            }
        };
    }
});

/*************************************************************/
/* Page events */
/*************************************************************/
Template.modal_invite_to_partup.events({
    'click [data-closepage]': function(event, template) {
        event.preventDefault();
        var partupId = template.data.partupId;
        var partup = Partups.findOne({_id: partupId});

        Intent.return('partup', {
            fallback_route: {
                name: 'partup',
                params: {
                    slug: partup.slug
                }
            }
        });
    },
    'change [data-filter-tribe]': function(event, template) {
        template.selectedNetwork.set(event.currentTarget.value);
        template.submitFilterForm();
    },
    'submit form#suggestionsQuery': function(event, template) {
        event.preventDefault();
        var form = event.currentTarget;
        template.searchQuery.set(form.elements.search_query.value);
    },
    'click [data-reset-search-query-input]': function(event, template) {
        event.preventDefault();
        $('[data-search-query-input]').val('');
        template.submitFilterForm();
    },
    'keyup [data-search-query-input]': function(e, template) {
        template.submitFilterForm();
    },
    'click [data-switch-tab]': function(event, template) {
        template.activeTab.set($(event.currentTarget).data('switch-tab'));
    }
});

var Cache = Partup.server.services.cache;

Meteor.methods({
    /**
     * Insert a Partup
     *
     * @param {mixed[]} fields
     */
    'partups.insert': function(fields) {
        check(fields, Partup.schemas.forms.partupCreate);

        var user = Meteor.user();
        if (!user) throw new Meteor.Error(401, 'unauthorized');

        try {
            var newPartup = Partup.transformers.partup.fromFormStartPartup(fields);
            newPartup._id = Random.id();
            newPartup.uppers = [user._id];
            newPartup.creator_id = user._id;
            newPartup.created_at = new Date();
            newPartup.slug = Partup.server.services.slugify.slugifyDocument(newPartup, 'name');
            newPartup.upper_data = [];
            newPartup.shared_count = {
                facebook: 0,
                twitter: 0,
                linkedin: 0,
                email: 0
            };
            newPartup.refreshed_at = new Date();

            //check(newPartup, Partup.schemas.entities.partup);

            Partups.insert(newPartup);
            Meteor.users.update(user._id, {$addToSet: {'upperOf': newPartup._id}});

            return {
                _id: newPartup._id,
                slug: newPartup.slug
            };
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_could_not_be_inserted');
        }
    },

    /**
     * Update a Partup
     *
     * @param {string} partupId
     * @param {mixed[]} fields
     */
    'partups.update': function(partupId, fields) {
        check(partupId, String);
        check(fields, Partup.schemas.forms.partupUpdate);

        var user = Meteor.user();
        var partup = Partups.findOneOrFail(partupId);
        var oldLanguage = partup.language;

        var uppers = partup.uppers || [];

        if (!partup.isEditableBy(user)) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        try {
            var newPartupFields = Partup.transformers.partup.fromFormStartPartup(fields);

            // update the slug when the name has changed
            if (fields.name) {
                var document = {
                    _id: partup._id,
                    name: newPartupFields.name
                };
                newPartupFields.slug = Partup.server.services.slugify.slugifyDocument(document, 'name');
            }

            Partups.update(partupId, {$set: newPartupFields});

            Event.emit('partups.language.updated', oldLanguage, newPartupFields.language);

            return {
                _id: partup._id
            };
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_could_not_be_updated');
        }
    },

    /**
     * Remove a Partup
     *
     * @param {string} partupId
     */
    'partups.remove': function(partupId) {
        check(partupId, String);

        var user = Meteor.user();
        var partup = Partups.findOneOrFail(partupId);

        if (!partup.isRemovableBy(user)) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        try {
            partup.remove();

            return {
                _id: partup._id
            };
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_could_not_be_removed');
        }
    },

    /**
     * Discover partups based on provided filters
     *
     * @param {Object} parameters
     * @param {string} options.networkId
     * @param {string} options.locationId
     * @param {string} options.sort
     * @param {string} options.textSearch
     * @param {number} options.limit
     * @param {string} options.language
     */
    'partups.discover': function(parameters) {
        check(parameters, {
            networkId: Match.Optional(String),
            locationId: Match.Optional(String),
            sort: Match.Optional(String),
            textSearch: Match.Optional(String),
            limit: Match.Optional(Number),
            language: Match.Optional(String)
        });

        var userId = Meteor.userId();

        var cacheId = 'discover_partupids_' + JSON.stringify(parameters);
        if (!userId && Cache.has(cacheId)) {
            return Cache.get(cacheId) || [];
        }

        var options = {};
        parameters = parameters || {};

        if (parameters.limit) options.limit = parseInt(parameters.limit);

        parameters = {
            networkId: parameters.networkId,
            locationId: parameters.locationId,
            sort: parameters.sort,
            textSearch: parameters.textSearch,
            limit: parameters.limit,
            language: (parameters.language === 'all') ? undefined : parameters.language
        };

        var partupIds = Partups.findForDiscover(userId, options, parameters).map(function(partup) {
            return partup._id;
        });

        if (!userId) Cache.set(cacheId, partupIds, 3600);

        return partupIds;
    },

    /**
     * Return a list of partups based on search query
     *
     * @param {string} searchString
     * @param {string} exceptPartupId
     * @param {boolean} onlyPublic When this is true, only public partups will be returned
     */
    'partups.autocomplete': function(searchString, exceptPartupId, onlyPublic) {
        check(searchString, String);
        check(exceptPartupId, Match.Optional(String));
        check(onlyPublic, Match.Optional(Boolean));

        var user = Meteor.user();
        if (!user) throw new Meteor.Error(401, 'unauthorized');
        onlyPublic = onlyPublic || false;

        var selector = {};

        selector.name = new RegExp('.*' + searchString + '.*', 'i');
        selector._id = {$ne: exceptPartupId};

        if (onlyPublic) {
            selector.privacy_type = {'$in': [Partups.PUBLIC, Partups.NETWORK_PUBLIC]};
        }

        try {
            return Partups.guardedFind(Meteor.userId(), selector, {limit: 30}).fetch();
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partups_could_not_be_autocompleted');
        }
    },

    /**
     * Feature a specific partup (superadmin only)
     *
     * @param {string} partupId
     * @param {mixed[]} fields
     */
    'partups.feature': function(partupId, fields) {
        check(partupId, String);
        check(fields, Partup.schemas.forms.featurePartup);

        var user = Meteor.user();
        if (!user) throw new Meteor.Error(401, 'unauthorized');
        if (!User(user).isAdmin()) throw new Meteor.Error(401, 'unauthorized');

        try {
            var author = Meteor.users.findOne(fields.author_id);
            featured = {
                'active': true,
                'by_upper': {
                    '_id': author._id,
                    'title': fields.job_title
                },
                'comment': fields.comment
            };

            Partups.update(partupId, {$set: {'featured': featured}});

        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_could_not_be_featured');
        }
    },

    /**
     * Unfeature a specific partup (superadmin only)
     *
     * @param {string} partupId
     */
    'partups.unfeature': function(partupId) {
        check(partupId, String);

        var user = Meteor.user();
        if (!user) throw new Meteor.Error(401, 'unauthorized');
        if (!User(user).isAdmin()) throw new Meteor.Error(401, 'unauthorized');

        try {
            Partups.update(partupId, {$unset: {'featured': ''}});
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_could_not_be_unfeatured');
        }
    },

    /**
    * Returns partup stats to superadmins only
    */
    'partups.admin_all': function(selector, options) {
        var user = Meteor.user();
        if (!user) throw new Meteor.Error(401, 'unauthorized');
        if (!User(user).isAdmin()) throw new Meteor.Error(401, 'unauthorized');

        selector = selector || {};
        options = options || {};
        return Partups.findForAdminList(selector, options).fetch();
    },

    /**
    * Returns partup stats to superadmins only
    */
    'partups.admin_stats': function() {
        var user = Meteor.user();
        if (!user) throw new Meteor.Error(401, 'unauthorized');
        if (!User(user).isAdmin()) throw new Meteor.Error(401, 'unauthorized');

        return Partups.findStatsForAdmin();
    },

    /**
     * Consume an access token and add the user to the invites
     */
    'partups.convert_access_token_to_invite': function(partupId, accessToken) {
        check(partupId, String);
        check(accessToken, String);

        var user = Meteor.user();
        var partup = Partups.findOneOrFail(partupId);

        try {
            partup.convertAccessTokenToInvite(user._id, accessToken);
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_access_token_could_not_be_converted_to_invite');
        }
    },

    /**
     * Reset new updates count
     *
     * @param {String} partupId
     */
    'partups.reset_new_updates': function(partupId) {
        check(partupId, String);

        try {
            var partup = Partups.findOne({_id: partupId, 'upper_data._id': Meteor.userId()});
            if (partup) {
                Partups.update({_id: partupId, 'upper_data._id': Meteor.userId()}, {$set: {'upper_data.$.new_updates': []}});
            }
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partup_new_updates_could_not_be_reset');
        }
    },

    /**
     * Invite an existing upper to a partup
     *
     * @param {string} partupId
     * @param {string} inviteeId
     * @param {string} searchQuery
     */
    'partups.invite_existing_upper': function(partupId, inviteeId, searchQuery) {
        check(partupId, String);
        check(inviteeId, String);
        check(searchQuery, Match.Optional(String));

        var inviter = Meteor.user();
        if (!inviter) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        var partup = Partups.findOneOrFail(partupId);
        var isAllowedToAccessPartup = !!Partups.guardedFind(inviter._id, {_id: partup._id}).count() > 0;
        if (!isAllowedToAccessPartup) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        if (partup.isRemoved()) throw new Meteor.Error(404, 'partup_could_not_be_found');

        var invitee = Meteor.users.findOneOrFail(inviteeId);

        var invite = {
            type: Invites.INVITE_TYPE_PARTUP_EXISTING_UPPER,
            partup_id: partup._id,
            inviter_id: inviter._id,
            invitee_id: invitee._id,
            created_at: new Date
        };

        Invites.insert(invite);

        // Add to the invite list of the partup
        if (!partup.hasInvitedUpper(invitee._id)) {
            Partups.update(partup._id, {$addToSet: {invites: invitee._id}});
        }

        Event.emit('invites.inserted.partup', inviter, partup, invitee, searchQuery);
    },

    /**
     * Invite someone to an partup
     *
     * @param {string} partupId
     * @param {Object} fields
     * @param {[Object]} fields.invitees
     * @param {String} fields.invitees.name
     * @param {String} fields.invitees.email
     * @param {String} fields.message
     */
    'partups.invite_by_email': function(partupId, fields) {
        check(partupId, String);
        check(fields, Partup.schemas.forms.inviteUpper);

        var inviter = Meteor.user();

        if (!inviter) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        var partup = Partups.findOneOrFail(partupId);

        if (partup.isRemoved()) throw new Meteor.Error(404, 'partup_could_not_be_found');

        var isAllowedToAccessPartup = !!Partups.guardedFind(inviter._id, {_id: partup._id}).count() > 0;
        if (!isAllowedToAccessPartup) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        var invitees = fields.invitees || [];

        invitees.forEach(function(invitee) {
            var isAlreadyInvited = !!Invites.findOne({
                partup_id: partupId,
                invitee_email: invitee.email,
                type: Invites.INVITE_TYPE_PARTUP_EMAIL
            });

            if (isAlreadyInvited) {
                //@TODO How to handle this scenario? Because now, we just skip to the next invitee
                //throw new Meteor.Error(403, 'email_is_already_invited_to_network');
                return;
            }

            var accessToken = Random.secret();

            var invite = {
                type: Invites.INVITE_TYPE_PARTUP_EMAIL,
                partup_id: partup._id,
                inviter_id: inviter._id,
                invitee_name: invitee.name,
                invitee_email: invitee.email,
                message: fields.message,
                access_token: accessToken,
                created_at: new Date
            };

            Invites.insert(invite);

            Event.emit('invites.inserted.partup.by_email', inviter, partup, invitee.email, invitee.name, fields.message, accessToken);
        });
    },

    /**
     * Get user suggestions for a given partup
     *
     * @param {String} partupId
     * @param {Object} options
     * @param {String} options.query
     * @param {String} options.invited_in_partup
     * @param {String} options.network
     * @param {Number} options.limit
     * @param {Number} options.skip
     *
     * @return {[string]}
     */
    'partups.user_suggestions': function(partupId, options) {
        check(partupId, String);
        check(options, {
            query: Match.Optional(String),
            network: Match.Optional(String),
            invited_in_partup: Match.Optional(String),
            limit: Match.Optional(Number),
            skip: Match.Optional(Number)
        });

        this.unblock();

        var upper = Meteor.user();

        if (!upper) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        var users = Partup.server.services.matching.matchUppersForPartup(partupId, options);

        // We are returning an array of IDs instead of an object
        return users.map(function(user) {
            return user._id;
        });
    },

    /**
     * Archive a partup
     *
     * @param {String} partupId
     */
    'partups.archive': function(partupId) {
        check(partupId, String);

        var upper = Meteor.user();
        var partup = Partups.findOneOrFail(partupId);

        if (!upper || (!User(upper).isAdmin() && !partup.hasUpper(upper._id))) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        try {
            Partups.update(partup._id, {$set: {archived_at: new Date()}});

            Event.emit('partups.archived', upper._id, partup);
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(500, 'partup_could_not_be_archived');
        }
    },

    /**
     * Unarchive a partup
     *
     * @param {String} partupId
     */
    'partups.unarchive': function(partupId) {
        check(partupId, String);

        var upper = Meteor.user();
        var partup = Partups.findOneOrFail(partupId);

        if (!upper || (!User(upper).isAdmin() && !partup.hasUpper(upper._id))) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        try {
            Partups.update(partup._id, {$unset: {archived_at: ''}});

            Event.emit('partups.unarchived', upper._id, partup);
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(500, 'partup_could_not_be_unarchived');
        }
    },

    /**
     * Change the network a partup belongs to
     *
     * @param {String} partupId
     * @param {String} networkId
     */
    'partups.change_network': function(partupId, networkId) {
        check(partupId, String);
        check(networkId, String);

        var upper = Meteor.user();
        if (!upper || (!User(upper).isAdmin())) {
            throw new Meteor.Error(401, 'unauthorized');
        }

        var network = Networks.findOneOrFail(networkId);
        var partup = Partups.findOneOrFail(partupId);

        // Update the new privacy type, but only if it's neither of network_admins or network_colleagues type
        if (partup.privacy_type !== Partups.NETWORK_ADMINS && partup.privacy_type !== Partups.NETWORK_COLLEAGUES) {
            var privacyType = undefined;
            switch (network.privacy_type) {
                case Networks.NETWORK_PUBLIC:
                    privacyType = Partups.NETWORK_PUBLIC;
                    break;
                case Networks.NETWORK_INVITE:
                    privacyType = Partups.NETWORK_INVITE;
                    break;
                case Networks.NETWORK_CLOSED:
                    privacyType = Partups.NETWORK_CLOSED;
                    break;
            }
        }

        var newData = {network_id: network._id};
        if (privacyType !== undefined) {
            newData.privacy_type = privacyType;
        }

        // Set the updated data
        Partups.update(partup._id, {$set: newData});
    },

    /**
     * Insert a partner request update
     *
     * @param {string} partupId
     */
    'partups.partner_request': function(partupId) {
        check(partupId, String);

        this.unblock();

        var upper = Meteor.user();
        if (!upper) throw new Meteor.Error(401, 'unauthorized');

        var partup = Partups.findOneOrFail(partupId);

        try {
            // Check if the upper is not already a (pending) partner
            if (partup.hasUpper(upper._id) || partup.hasPendingPartner(upper._id)) {
                return false;
            }

            // Add upper to pending partner list
            Partups.update(partup._id, {$push: {pending_partners: upper._id}});

            // Create the update
            var partner_update = Partup.factories.updatesFactory.make(upper._id, partup._id, 'partups_partner_request', {});
            var updateId = Updates.insert(partner_update);

            Event.emit('partups.partner_requested', upper, partup, updateId);

            return updateId;
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'unable_to_partner_request');
        }
    },

    /**
     * Accept a partner request
     *
     * @param {string} updateId
     */
    'partups.partner_accept': function(updateId) {
        check(updateId, String);

        this.unblock();

        var upper = Meteor.user();
        var update = Updates.findOneOrFail(updateId);

        if (!upper) throw new Meteor.Error(401, 'unauthorized');
        if (!User(upper).isPartnerInPartup(update.partup_id)) throw new Meteor.Error(401, 'unauthorized');

        var requester = Meteor.users.findOneOrFail(update.upper_id);
        var partup = Partups.findOneOrFail(update.partup_id);

        try {
            // Remove upper from pending partner list
            Partups.update(partup._id, {$pull: {pending_partners: update.upper_id}});

            partup.makePartner(requester._id);

            // Update the update type
            Updates.update(update._id, {$set: {type: 'partups_uppers_added'}});

            // Post system message
            Partup.server.services.system_messages.send(upper, update._id, 'system_partner_accepted', {update_timestamp: false});

            Event.emit('partups.partner_request.accepted', upper, partup, requester._id, update._id);
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partner_request_could_not_be_accepted');
        }
    },

    /**
     * Reject a partner request
     *
     * @param {string} updateId
     */
    'partups.partner_reject': function(updateId) {
        check(updateId, String);

        this.unblock();

        var upper = Meteor.user();
        var update = Updates.findOneOrFail(updateId);

        if (!upper) throw new Meteor.Error(401, 'unauthorized');
        if (!User(upper).isPartnerInPartup(update.partup_id)) throw new Meteor.Error(401, 'unauthorized');

        var partup = Partups.findOneOrFail(update.partup_id);

        try {
            // Remove upper from pending partner list
            Partups.update(partup._id, {$pull: {pending_partners: update.upper_id}});

            // Update the update type
            Updates.update(update._id, {$set: {type: 'partups_partner_rejected'}});

            // Post system message
            Partup.server.services.system_messages.send(upper, update._id, 'system_partner_rejected', {update_timestamp: false});

            Event.emit('partups.partner_request.rejected', upper, update.partup_id, update.upper_id, update._id);
        } catch (error) {
            Log.error(error);
            throw new Meteor.Error(400, 'partner_request_could_not_be_rejected');
        }
    }
});

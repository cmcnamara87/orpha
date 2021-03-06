'use strict';

/**
 * @ngdoc service
 * @name orphaApp.transactionrequest
 * @description
 * # transactionrequest
 * Factory in the orphaApp.
 */
angular.module('orphaApp')
    .factory('TransactionRequest', function($resource, $http, ENV, ListTransaction,
        $q, $state, $log, transactionStatusService, toaster) {
        var TransactionRequest = $resource(ENV.apiEndpoint + '/entity_node/:nid', {
            'parameters[type]': 'transaction_request',
            nid: '@nid'
        }, {
            get: {
                 method: 'GET',
                transformResponse: $http.defaults.transformResponse.concat([
                    transformGetResponse
                ])
            },
            'update': {
                method: 'PUT'
            }
        });

        angular.extend(TransactionRequest.prototype, {
            loadTransactions: loadTransactions,
            loadDescription: loadDescription,
            accept: accept,
            reject: reject,
            addChangeTransaction: addChangeTransaction,
            addAddTransaction: addAddTransaction,
            addRemoveTransaction: addRemoveTransaction,
            setReason: setReason,
            setTitle: setTitle,
            save: save,
            getTransactions: getTransactions,
            addTransaction: addTransaction,
            isAccepted: isAccepted,
            isRejected: isRejected,
            isSubmitted: isSubmitted
        });
        TransactionRequest.getOpen = getOpen;
        TransactionRequest.getClosed = getClosed;
        TransactionRequest.getForUser = getForUser;
        TransactionRequest.create = create;

        return TransactionRequest;

        ///////////////////

        function create() {
            var transactionRequest = new TransactionRequest({
                title: 'test',
                type: 'transaction_request',
                'tr_timestamp': new Date().getTime() / 1000,
                'tr_user': 0,
                body: {
                    value: '',
                    summary: ''
                }
            });
            transactionRequest.$$transactions = [];
            return transactionRequest;
        }

        function setReason(reason) {
            /* jshint validthis: true */
            reason = reason || '';
            this.body.value = reason;
            this.body.summary = reason;
            return this;
        }

        function setTitle(title) {
            /* jshint validthis: true */
            this.title = title;
            return this;
        }

        function getTransactions() {
            /* jshint validthis: true */
            return this.$$transactions;
        }

        function addTransaction(transaction) {
            /* jshint validthis: true */
            this.getTransactions().push(transaction);
            return this;
        }

        // TODO: Abstract these listTransctions into somewhere else
        function addChangeTransaction(nodeNid, propertyName, fromNid, toNid) {
            /* jshint validthis: true */
            var transaction = new ListTransaction({
                title: 'transaction',
                type: 'list_transaction',
                ltrans_position: this.getTransactions().length,
                ltrans_onnode: nodeNid,
                ltrans_onprop: propertyName,
                ltrans_svalref: toNid,
                ltrans_cvalref: fromNid
            });
            this.getTransactions().push(transaction);
            return this;
        }

        function addAddTransaction(nodeNid, propertyName, newNid) {
            /* jshint validthis: true */
            var transaction = new ListTransaction({
                title: 'transaction',
                type: 'list_transaction',
                ltrans_position: this.getTransactions().length,
                ltrans_onnode: nodeNid,
                ltrans_onprop: propertyName,
                ltrans_svalref: newNid,
                ltrans_cvalref: 0
            });
            this.getTransactions().push(transaction);
            return this;
        }

        function addRemoveTransaction(nodeNid, propertyName, removeNid) {
            /* jshint validthis: true */
            var transaction = new ListTransaction({
                title: 'transaction',
                type: 'list_transaction',
                ltrans_position: this.getTransactions().length,
                ltrans_onnode: nodeNid,
                ltrans_onprop: propertyName,
                ltrans_svalref: 0,
                ltrans_cvalref: removeNid
            });
            this.getTransactions().push(transaction);
            return this;
        }

        function save() {
            /* jshint validthis: true */
            var transactionRequest = this;
            var transactions = _.map(this.getTransactions(), function(transaction) {
                return transaction.$save();
            });
            // Save all the transactions
            return $q.all(transactions).then(function(savedTransactions) {
                var transactionIds = _.pluck(savedTransactions, 'nid');
                return transactionStatusService.loadStatusCodes().then(function() {
                    transactionRequest.tr_trans = transactionIds;
                    transactionRequest.tr_status = transactionStatusService.submittedNid;
                    return transactionRequest.$save();
                });
            }).then(function() {
                toaster.pop('success', 'Suggestion submitted.');
            });
        }

        function getForUser(userId) {
            return transactionStatusService.loadStatusCodes().then(function() {
                return TransactionRequest.query({
                    'uid': userId
                }).$promise;
            }).then(function(transactionRequests) {
                return transactionRequests;
            }, function() {
                return [];
            });
        }

        function getOpen(page) {
            if (!page) {
                page = 0;
            }
            return transactionStatusService.loadStatusCodes().then(function() {
                return TransactionRequest.query({
                    'parameters[tr_status]': transactionStatusService.submittedNid,
                    page: page
                }).$promise.then(function(transactionRequests) {
                    if (transactionRequests.length !== 20) {
                        return transactionRequests;
                    }
                    return getOpen(page + 1).then(function(otherOpenTransactionRequests) {
                        return transactionRequests.concat(otherOpenTransactionRequests);
                    });
                }, function() {
                    return [];
                });
            });
        }

        function getClosed(page) {
            if (!page) {
                page = 0;
            }
            // TODO: Make this less gross
            return transactionStatusService.loadStatusCodes().then(function() {
                return $q.all([
                    _getAccepted(page),
                    _getRejected(page)
                ]).then(function(requests) {
                    var closedTransactionRequests = _.flatten(requests);
                    if (requests[0].length !== 20 && requests[1].length !== 20) {
                        return closedTransactionRequests;
                    }
                    return getClosed(page + 1).then(function(otherClosedTransactionRequests) {
                        return closedTransactionRequests.concat(otherClosedTransactionRequests);
                    });
                });
            });
        }

        function _getAccepted(page) {
            return _getStatus(transactionStatusService.acceptedNid, page);
        }

        function _getRejected(page) {
            return _getStatus(transactionStatusService.rejectedNid, page);
        }

        function _getStatus(status, page) {
            return TransactionRequest.query({
                'parameters[tr_status]': status,
                page: page
            }).$promise.then(function(transactionRequests) {
                return transactionRequests;
            }, function() {
                return [];
            });
        }

        function transformGetResponse(transactionRequest, headersGetter) {
            return transactionRequest;
        }

        function accept() {
            /* jshint validthis: true */
            var transactionRequest = this;
            return transactionStatusService.loadStatusCodes().then(function() {
                return $http.put(ENV.apiEndpoint + '/entity_node/' + transactionRequest.nid, {
                    nid: transactionRequest.nid,
                    tr_status: transactionStatusService.acceptedNid
                });
            });
        }

        function reject() {
            /* jshint validthis: true */
            var transactionRequest = this;
            return transactionStatusService.loadStatusCodes().then(function() {
                return $http.put(ENV.apiEndpoint + '/entity_node/' + transactionRequest.nid, {
                    nid: transactionRequest.nid,
                    tr_status: transactionStatusService.rejectedNid
                });
            });
        }

        function loadDescription() {
            // TODO: fix up this type switching
            
            /* jshint validthis: true */
            var transactionRequest = this;
            // Get the nodes
            if (!transactionRequest['tr_trans'].length) {
                return transactionRequest.title;
            }
            var listTransaction = transactionRequest['tr_trans'][0];
            var node = listTransaction['ltrans_onnode'];
            if (node.type === 'disorder_gene') {
                transactionRequest.description = 'Relationship between <a href="' +
                    $state.href('gene', {
                        'geneId': node['disgene_gene'].nid
                    }) + '">' +
                    node['disgene_gene'].title + '<a/> and ' +
                    '<a href="' + $state.href('disorder', {
                        'disorderId': node['disgene_disorder'].nid
                    }) + '">' +
                    node['disgene_disorder'].title + '</a>';
                return;
            }

            if (node.type === 'disorder_sign') {
                transactionRequest.description = 'Relationship between <a href="' +
                    $state.href('sign', {
                        'signId': node['ds_sign'].nid
                    }) + '">' +
                    node['ds_sign'].title + '<a/> and ' +
                    '<a href="' + $state.href('disorder', {
                        'disorderId': node['ds_disorder'].nid
                    }) + '">' +
                    node['ds_disorder'].title + '</a>';
                return;
            }

            var params = {};
            params[node.type + 'Id'] = node.nid;
            transactionRequest.description = '<a href="' +
                $state.href(node.type, params) + '">' + node.title + '</a>';
            return;


        }

        function loadTransactions() {
            /* jshint validthis: true */
            var transactionRequest = this;
            transactionRequest.description = 'Loading...';
            var ids = _.pluck(transactionRequest['tr_trans'], 'nid');
            if (!ids.length) {
                return $q.when([]);
            }
            var request = _.indexBy(ids, function(ids, index) {
                return 'parameters[nid][' + index + ']';
            });
            return ListTransaction.query(request).$promise.then(function(listTransactions) {
                transactionRequest['tr_trans'] = listTransactions;
                var promises = _.map(listTransactions, function(listTransaction) {
                    return listTransaction.loadReferences();
                });
                return $q.all(promises).then(function() {
                    return listTransactions;
                });
            });
        }

        function isAccepted() {
            /* jshint validthis: true */
            return transactionStatusService.isAcceptedTr(this);
        }

        function isRejected() {
            /* jshint validthis: true */
            return transactionStatusService.isRejectedTr(this);
        }

        function isSubmitted() {
            /* jshint validthis: true */
            return transactionStatusService.isSubmittedTr(this);
        }

    });

import { mapActions, mapGetters } from 'vuex';
import FirewallIpListsDialog from '../components/firewall/FirewallIpListsDialog.vue';
import FirewallOfflineState from '../components/firewall/FirewallOfflineState.vue';
import cacheMethods from '../features/firewall/cacheMethods';
import connectionMethods from '../features/firewall/connectionMethods';
import ddosMethods from '../features/firewall/ddosMethods';
import deploymentMethods from '../features/firewall/deploymentMethods';
import firewallLifecycle from '../features/firewall/lifecycle';
import { createFirewallState, firewallComputed } from '../features/firewall/model';
import queryMethods from '../features/firewall/queryMethods';
import ruleMethods from '../features/firewall/ruleMethods';
import firewallWatchers from '../features/firewall/watchers';

export default {
  name: 'RulesScript',
  components: { FirewallIpListsDialog, FirewallOfflineState },
  props: {
    serverId: {
      type: String,
      required: true
    }
  },
  data: createFirewallState,
  computed: {
    ...mapGetters('servers', ['getLoading']),
    ...firewallComputed
  },
  ...firewallLifecycle,
  methods: {
    ...mapActions('servers', [
      'getServer',
      'deployIptato',
      'connectServer',
      'checkScriptExists'
    ]),
    ...mapActions('rules', [
      'getBlockList',
      'blockSPAMAction',
      'blockCustomPortsAction',
      'unblockSPAMAction',
      'unblockCustomPortsAction',
      'getInboundPorts',
      'getInboundIPs',
      'allowInboundPortsAction',
      'disallowInboundPortsAction',
      'allowInboundIPsAction',
      'disallowInboundIPsAction',
      'getSSHPort',
      'clearAllRulesAction',
      'getServerCache',
      'getCacheLastUpdate',
      'clearServerCache',
      'updateCacheItem',
      'setupDdosProtection',
      'setupCustomPortProtection',
      'manageIpLists',
      'getDefenseStatus'
    ]),
    ...queryMethods,
    ...cacheMethods,
    ...ruleMethods,
    ...ddosMethods,
    ...deploymentMethods,
    ...connectionMethods
  },
  watch: firewallWatchers
};

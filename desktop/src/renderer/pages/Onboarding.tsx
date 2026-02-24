import React, { useState } from 'react';
import {
  Shield,
  Key,
  ChevronRight,
  AlertTriangle,
  Terminal,
  Globe,
  HardDrive,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';

const SLOTH_ART = `\
############################################################################################################################################
############################################################################################################################################
############################################################################################################################################
############################################# -. -         -*###############################################################################
#########################################* .--: -=-=======+**+ .*###########################################################################
########################################+ :=:. -==============+*+ +#########################################################################
######################################* -===============+###+===+*-.########################################################################
#####################################:.=============*##########+==*:-#######################################################################
####################################=.====+##############*:  -*#*==* +######################################################################
#########################*  :*#####* -===###############*:=-:  =*==** +#####################################################################
#########################****+- .-#= -==##*:.-:.##+=====* #+*--=====+*+ ..-*################################################################
########################**********=: -==#*-.:  :.=      =*#**==========+++***-:  -=#########################################################
#######################****.  +*****.:-=++= =** #==-. ===-==#*==================+***:  +*###################################################
######################*********=  .+* :-======##==.:..:.-==+#=========================**+- :*###############################################
#####################***************:  .--====+#+=======+*#*==============================+*+: =############################################
####################********************- ---====######*=====================================+**- =#########################################
###################*++********************+-  .:-----===========================================+**:.#######################################
##################--+++++++*******************++- .--- :===========================================**- *####################################
####################+  :+++++++********************: : ==========- ==================================**: ###################################
########################*- .-+++++++********: .=***** ==========: ----------===========================** =#################################
#############################=. :=++++++********=. -= =========- ------------------=====================+*.=################################
##################################-  :+++++++*******:.=========.:+=:    ---------------==================+* *###############################
######################################+: .-+++++++*+:.========- ******+++=-  .--------------==============*-=###############################
#########################################:::  :=++==.-========.  -+*********++=: .------------. ==========+.+###############################
########################################* --====:  : ========- ****:  =**********++. :------: ============= ################################
########################################:.------- +# ========:.+*******=. ******-.=**+-. :- :============:.#################################
########################################-.------.=## -======- =+++++***************-. -+*+ -===========-   +*###############################
########################################-.-----:.### --====-- .  -+++++++***************: ===========  =+++**  .*###########################
########################################-.-----::####::------: ####=. .=+++++++**********-.=====-.  :=++++********-  -*######################
########################################=.----::####:.------ *#########-  -=++++++****** -=====- :  -+****************.  +*#################
#########################################:.--: #####-.------ ##############*:  =+++++++-.-====- +++**+:  =****************+ .###############
#########################################* + + ###### ------ ##############*:  =+++++++-.-====- +++**+:  =****************+ .###############
##########################################*. :.######+ ----: ###################=. :=++:.----: +++********=. :+************#################
######################################################* ---  ###################### :.   ---: ==+*************************##################
########################################################.-. =.#####################+   =     .==+++++***** .*************###################
#########################################################*:.*#######################=. .  = -:-  :=++++++****- +-********###################
##########################################################################################==######*.  ==++++++****. .+**####################
#######################################################################################################*  .++++++++****#####################
###########################################################################################################*-  :=+++++######################
################################################################################################################*.  =#######################
############################################################################################################################################
############################################################################################################################################
############################################################################################################################################`;

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<'terms' | 'apikey'>('terms');
  const [agreed, setAgreed] = useState(false);
  const [provider, setProvider] = useState('claude');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const handleAcceptTerms = () => {
    if (!agreed) return;
    setStep('apikey');
  };

  const handleValidateAndSave = async () => {
    const key = apiKey.trim();
    if (!key) {
      await window.megasloth?.completeOnboarding();
      onComplete();
      return;
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const result = await window.megasloth?.validateApiKey({ provider, apiKey: key });
      if (result?.valid) {
        setValidationResult({ valid: true });
        setSaving(true);
        await window.megasloth?.saveApiConfig({ provider, apiKey: key });
        await window.megasloth?.completeOnboarding();
        onComplete();
      } else {
        setValidationResult({ valid: false, error: result?.error || 'Validation failed' });
      }
    } catch {
      setValidationResult({ valid: false, error: 'Connection error. Check your network.' });
    }

    setValidating(false);
    setSaving(false);
  };

  if (step === 'terms') {
    return (
      <div className="h-screen bg-[#0a0e17] flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-y-auto">
        <div className="max-w-2xl w-full animate-fade-in py-4 sm:py-6 md:py-8">
          <div className="card border-slate-700/40">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Terms of Service & Legal Disclaimer</h2>
                <p className="text-xs text-slate-500">Please read carefully before proceeding</p>
              </div>
            </div>

            <div className="text-sm text-slate-400 space-y-3 max-h-[200px] sm:max-h-[240px] md:max-h-[280px] overflow-y-auto pr-2 mb-5">
              <div className="flex gap-3 p-3 rounded-lg bg-slate-800/30">
                <Terminal className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Full System Access</p>
                  <p className="text-xs text-slate-400 mt-1">
                    MegaSloth will have unrestricted access to your terminal, filesystem, browser,
                    clipboard, and network interfaces. It may execute arbitrary shell commands,
                    read/write/delete files, and interact with external services.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3 rounded-lg bg-slate-800/30">
                <Globe className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Autonomous Credential Provisioning</p>
                  <p className="text-xs text-slate-400 mt-1">
                    MegaSloth will automatically provision and manage API credentials for third-party
                    services (GitHub, GitLab, AWS, GCP, Slack, Discord, etc.) on your behalf
                    via OAuth, CLI tools, or browser automation.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3 rounded-lg bg-slate-800/30">
                <HardDrive className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Autonomous Task Execution</p>
                  <p className="text-xs text-slate-400 mt-1">
                    MegaSloth autonomously plans and executes multi-step tasks including running builds,
                    deploying code, modifying infrastructure, sending notifications, and managing
                    repositories without requiring per-action approval.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3 rounded-lg bg-slate-800/30">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium text-sm">Security & Data Handling</p>
                  <p className="text-xs text-slate-400 mt-1">
                    All credentials are encrypted locally using AES-256-GCM. No data is transmitted
                    to third parties beyond the AI provider you configure. You may adjust the security
                    profile (restricted / standard / full) at any time.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                <div className="flex gap-3 items-start">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-medium text-sm">Limitation of Liability</p>
                    <p className="text-xs text-slate-400 mt-1">
                      MegaSloth is provided &quot;as is&quot; without warranty of any kind.
                      The developers shall not be held liable for any damages, data loss, security breaches,
                      unauthorized access, financial loss, or any other consequences arising from the use
                      of this software. You assume full and sole responsibility for all actions performed
                      by the agent on your system and connected accounts.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 cursor-pointer hover:border-emerald-500/20 transition-colors mb-4">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="text-sm text-slate-300 leading-relaxed">
                I have read, understood, and agree to the above terms. I accept{' '}
                <strong className="text-white">full responsibility</strong> for all actions performed
                by MegaSloth on my system and connected accounts.
              </span>
            </label>

            <button
              onClick={handleAcceptTerms}
              disabled={!agreed}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Accept & Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0e17] flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="max-w-lg w-full animate-fade-in">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">Configure AI Provider</h1>
          <p className="text-slate-500 text-sm mt-1">MegaSloth needs one API key to operate</p>
        </div>

        <div className="card border-slate-700/40">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Key className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">AI Provider & API Key</h2>
              <p className="text-xs text-slate-500">Choose your preferred LLM provider</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-2 font-medium">Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'claude', label: 'Claude 4.6', sub: 'Anthropic — Sonnet / Opus' },
                  { id: 'openai', label: 'GPT-5.2', sub: 'OpenAI — Thinking / Codex' },
                  { id: 'gemini', label: 'Gemini 3.1', sub: 'Google — Pro / Flash' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setProvider(p.id); setValidationResult(null); }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      provider === p.id
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                        : 'bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-[10px] text-slate-500">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2 font-medium">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'claude' ? 'sk-ant-...' :
                    provider === 'openai' ? 'sk-...' : 'AIza...'
                  }
                  className="input-field pr-20"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {validationResult && !validationResult.valid && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium">Invalid API Key</p>
                <p className="text-xs text-red-400/70 mt-0.5">{validationResult.error}</p>
              </div>
            </div>
          )}

          {validationResult?.valid && (
            <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <p className="text-sm text-emerald-400 font-medium">API key verified successfully</p>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={handleValidateAndSave}
              disabled={validating || saving}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
            >
              {validating ? 'Validating key...' : saving ? 'Saving...' : apiKey.trim() ? 'Verify & Save' : 'Skip for Now'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!apiKey.trim() && (
            <p className="text-[11px] text-slate-600 mt-3 text-center">
              You can configure the API key later in Settings
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

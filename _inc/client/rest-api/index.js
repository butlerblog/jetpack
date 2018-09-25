/**
 * External dependencies
 */
require( 'es6-promise' ).polyfill();
import assign from 'lodash/assign';

const apiFetch = window.wp.apiFetch;

/**
 * Helps create new custom error classes to better notify upper layers.
 * @param {String} name the Error name that will be availble in Error.name
 * @return {Error}      a new custom error class.
 */
function createCustomError( name ) {
	class CustomError extends Error {
		constructor( ...args ) {
			super( ...args );
			this.name = name;
		}
	}
	return CustomError;
}

export const JsonParseError = createCustomError( 'JsonParseError' );
export const JsonParseAfterRedirectError = createCustomError( 'JsonParseAfterRedirectError' );
export const Api404Error = createCustomError( 'Api404Error' );
export const Api404AfterRedirectError = createCustomError( 'Api404AfterRedirectError' );
export const FetchNetworkError = createCustomError( 'FetchNetworkError' );

function JetpackRestApiClient() {
	const methods = {

		fetchSiteConnectionStatus: () => getRequest( '/jetpack/v4/connection' )
			.then( parseJsonResponse ),

		fetchUserConnectionData: () => getRequest( '/jetpack/v4/connection/data' )
			.then( parseJsonResponse ),

		fetchUserTrackingSettings: () => getRequest( '/jetpack/v4/tracking/settings' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		updateUserTrackingSettings: ( newSettings ) => postRequest(
			'/jetpack/v4/tracking/settings',
			{
				body: JSON.stringify( newSettings )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		disconnectSite: () => postRequest( '/jetpack/v4/connection', {
			body: JSON.stringify( { isActive: false } )
		} )
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchConnectUrl: () => getRequest( '/jetpack/v4/connection/url' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		unlinkUser: () => postRequest( '/jetpack/v4/connection/user', {
			body: JSON.stringify( { linked: false } )
		} )
			.then( checkStatus )
			.then( parseJsonResponse ),

		jumpStart: ( action ) => {
			let active;
			if ( action === 'activate' ) {
				active = true;
			}
			if ( action === 'deactivate' ) {
				active = false;
			}
			return postRequest( '/jetpack/v4/jumpstart', {
				body: JSON.stringify( { active } )
			} )
				.then( checkStatus )
				.then( parseJsonResponse );
		},

		fetchModules: () => getRequest( '/jetpack/v4/module/all' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchModule: ( slug ) => getRequest( `jetpack/v4/module/${ slug }` )
			.then( checkStatus )
			.then( parseJsonResponse ),

		activateModule: ( slug ) => postRequest(
			`jetpack/v4/module/${ slug }/active`,
			{
				body: JSON.stringify( { active: true } )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		deactivateModule: ( slug ) => postRequest(
			`jetpack/v4/module/${ slug }/active`,
			{
				body: JSON.stringify( { active: false } )
			}
		),

		updateModuleOptions: ( slug, newOptionValues ) => postRequest(
			`jetpack/v4/module/${ slug }`,
			{
				body: JSON.stringify( newOptionValues )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		updateSettings: ( newOptionValues ) => postRequest(
			'/jetpack/v4/settings',
			{
				body: JSON.stringify( newOptionValues )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		getProtectCount: () => getRequest( '/jetpack/v4/module/protect/data' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		resetOptions: ( options ) => postRequest(
			`jetpack/v4/options/${ options }`,
			{
				body: JSON.stringify( { reset: true } )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		getVaultPressData: () => getRequest( '/jetpack/v4/module/vaultpress/data' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		getAkismetData: () => getRequest( '/jetpack/v4/module/akismet/data' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		checkAkismetKey: () => getRequest( '/jetpack/v4/module/akismet/key/check' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		checkAkismetKeyTyped: apiKey => postRequest(
			'/jetpack/v4/module/akismet/key/check',
			{
				body: JSON.stringify( { api_key: apiKey } )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchStatsData: ( range ) => getRequest( statsDataUrl( range ) )
			.then( checkStatus )
			.then( parseJsonResponse )
			.then( handleStatsResponseError ),

		getPluginUpdates: () => getRequest( '/jetpack/v4/updates/plugins' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		getPlans: () => getRequest( '/jetpack/v4/plans' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchSettings: () => getRequest( '/jetpack/v4/settings' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		updateSetting: ( updatedSetting ) => postRequest( '/jetpack/v4/settings', {
			body: JSON.stringify( updatedSetting )
		} )
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchSiteData: () => getRequest( '/jetpack/v4/site' )
			.then( checkStatus )
			.then( parseJsonResponse )
			.then( body => JSON.parse( body.data ) ),

		fetchSiteFeatures: () => getRequest( '/jetpack/v4/site/features' )
			.then( checkStatus )
			.then( parseJsonResponse )
			.then( body => JSON.parse( body.data ) ),

		fetchRewindStatus: () => getRequest( '/jetpack/v4/rewind' )
			.then( checkStatus )
			.then( parseJsonResponse )
			.then( body => JSON.parse( body.data ) ),

		dismissJetpackNotice: ( notice ) => postRequest(
			`/jetpack/v4/notice/${ notice }`,
			{
				body: JSON.stringify( { dismissed: true } )
			}
		)
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchPluginsData: () => getRequest( '/jetpack/v4/plugins' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		fetchVerifySiteGoogleStatus: () => getRequest( '/jetpack/v4/verify-site/google' )
			.then( checkStatus )
			.then( parseJsonResponse ),

		verifySiteGoogle: () => postRequest( '/jetpack/v4/verify-site/google' )
			.then( checkStatus )
			.then( parseJsonResponse )
	};

	function addCacheBuster( route ) {
		const parts = route.split( '?' ),
			query = parts.length > 1
				? parts[ 1 ]
				: '',
			args = query.length
				? query.split( '&' )
				: [];

		args.push( '_cacheBuster=' + new Date().getTime() );

		return parts[ 0 ] + '?' + args.join( '&' );
	}

	function getRequest( path ) {
		return apiFetch( {
			path
		} );
	}

	function postRequest( path, body ) {
		return apiFetch( {
			path,
			body,
		} ).catch( catchNetworkErrors );
	}

	function statsDataUrl( range ) {
		let url = '/jetpack/v4/module/stats/data';
		if ( url.indexOf( '?' ) !== -1 ) {
			url = url + `&range=${ encodeURIComponent( range ) }`;
		} else {
			url = url + `?range=${ encodeURIComponent( range ) }`;
		}
		return url;
	}

	function handleStatsResponseError( statsData ) {
		// If we get a .response property, it means that .com's response is errory.
		// Probably because the site does not have stats yet.
		const responseOk =
			( statsData.general && statsData.general.response === undefined ) ||
			( statsData.week && statsData.week.response === undefined ) ||
			( statsData.month && statsData.month.response === undefined );
		return responseOk ? statsData : {};
	}

	assign( this, methods );
}

const restApi = new JetpackRestApiClient();

export default restApi;

function checkStatus( response ) {
	// Regular success responses
	if ( response.status >= 200 && response.status < 300 ) {
		return response;
	}

	if ( response.status === 404 ) {
		return new Promise( () => {
			const err = response.redirected
				? new Api404AfterRedirectError( response.redirected )
				: new Api404Error();
			throw err;
		} );
	}

	return response.json().then( json => {
		const error = new Error( `${ json.message } (Status ${ response.status })` );
		error.response = json;
		throw error;
	} );
}

function parseJsonResponse( response ) {
	return response.json().catch( e => catchJsonParseError( e, response.redirected, response.url ) );
}

function catchJsonParseError( e, redirected, url ) {
	const err = redirected
		? new JsonParseAfterRedirectError( url )
		: new JsonParseError();
	throw err;
}

// Catches TypeError coming from the Fetch API implementation
function catchNetworkErrors() {
	//Either one of:
	// * A preflight error like a redirection to an external site (which results in a CORS)
	// * A preflight error like ERR_TOO_MANY_REDIRECTS
	throw new FetchNetworkError();
}

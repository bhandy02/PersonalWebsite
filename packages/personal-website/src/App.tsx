import React, { Component } from 'react';
import ReactGA from 'react-ga';
import $ from 'jquery';
import './App.css';
import Header from './Components/Header';
import Footer from './Components/Footer';
import About from './Components/About';
import Resume from './Components/Resume';
import Contact from './Components/Contact';
import Testimonials from './Components/Testimonials';
import Portfolio from './Components/Portfolio';


interface AppState {
    resumeData: any
    dataLoaded: boolean
}



class App extends Component<{}, AppState> {
  constructor(props: {}){
    super(props);
    this.state = {
      resumeData: {},
      dataLoaded: false
    };

    ReactGA.initialize('UA-110570651-1');
    ReactGA.pageview(window.location.pathname);

    this.getResumeData = this.getResumeData.bind(this);

  }

  getResumeData(){
    const request = $.ajax({
          url: '/resumeData.json',
          dataType: 'json',
          cache: false,
          type: 'GET'
      });
    request.done((result) => {
        console.log(result);
        this.setState({dataLoaded: true, resumeData: result})
    });


    request.fail(function(xhr: any) {
        console.error(xhr);

    })
  }

  componentDidMount(){
    this.getResumeData();
  }

  render() {
      if (this.state.dataLoaded) {
          return (
              <div className="App">
                  <Header data={this.state.resumeData.main}/>
                  <About data={this.state.resumeData.main}/>
                  <Resume data={this.state.resumeData.resume}/>
                  <Portfolio data={this.state.resumeData.portfolio}/>
                  <Testimonials data={this.state.resumeData.testimonials}/>
                  <Contact data={this.state.resumeData.main}/>
                  <Footer data={this.state.resumeData.main}/>
              </div>
          );
      } else {
          return (<div> </div>);
      }

  }
}

export default App;
